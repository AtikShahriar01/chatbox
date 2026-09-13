// Server-side streaming chat proxy with multi-provider support.
// Detects the provider from baseUrl, builds the correct native request,
// and pipes the unified event stream to the browser as OpenAI-style SSE
// so the client code stays simple.

import { detectProvider } from "../../../lib/providerMeta";
import {
  buildOpenAIRequest,
  buildAnthropicRequest,
  buildGoogleRequest,
  buildOllamaRequest,
  buildCohereRequest,
} from "../../../lib/providers";
import { guard, providerUrlGuard } from "../../../lib/guard";
import { requireSession } from "../../../lib/session";

export const runtime = "nodejs";

function scrubKey(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]{8,}/gi, "Bearer ***REDACTED***")
    .replace(
      /("?(?:api[_-]?key|api[_-]?token|access[_-]?token|secret)"?\s*[:=]\s*")([^"]{6,})(")/gi,
      (_, a, _v, c) => `${a}***REDACTED***${c}`
    );
}

function buildProviderRequest(provider, params) {
  switch (provider) {
    case "anthropic": return buildAnthropicRequest(params);
    case "google": return buildGoogleRequest(params);
    case "cohere": return buildCohereRequest(params);
    case "ollama":
    case "lmstudio": return buildOllamaRequest(params);
    case "openai":
    case "openrouter":
    case "groq":
    case "deepseek":
    case "mistral":
    case "xai":
    case "together":
    case "fireworks":
    case "openai-compatible":
    default:
      return buildOpenAIRequest(params);
  }
}

export async function POST(req) {
  const blocked = guard(req, { rateKey: "chat", rateMax: 30, maxBody: 4 * 1024 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const {
    apiBaseUrl, apiKey, model, messages, temperature, stream, systemPrompt, max_tokens,
    tools, tool_choice,
  } = body || {};

  // ---- strict schema validation (security directive §7: treat all input as
  // untrusted — reject before any processing; fail closed) ----
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.length > 500 || !/^https?:\/\//i.test(apiBaseUrl)) {
    return new Response("Invalid apiBaseUrl", { status: 400 });
  }
  // SSRF (directive §11): the proxy target must never be a cloud metadata
  // endpoint — local/LAN inference servers stay allowed.
  {
    const urlBad = providerUrlGuard(apiBaseUrl);
    if (urlBad) return new Response(`apiBaseUrl rejected: ${urlBad}`, { status: 400 });
  }
  if (typeof model !== "string" || !model.trim() || model.length > 200) {
    return new Response("Invalid model", { status: 400 });
  }
  if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length > 1000)) {
    return new Response("Invalid apiKey", { status: 400 });
  }
  if (systemPrompt !== undefined && (typeof systemPrompt !== "string" || systemPrompt.length > 32_000)) {
    return new Response("Invalid systemPrompt", { status: 400 });
  }
  if (temperature !== undefined && (typeof temperature !== "number" || !(temperature >= 0 && temperature <= 2))) {
    return new Response("Invalid temperature", { status: 400 });
  }
  if (max_tokens !== undefined && (!Number.isFinite(max_tokens) || max_tokens < 1 || max_tokens > 8192)) {
    return new Response("Invalid max_tokens", { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return new Response("Invalid messages[]", { status: 400 });
  }
  for (const m of messages) {
    if (!m || typeof m !== "object" || !["user", "assistant", "system", "tool"].includes(m.role)) {
      return new Response("Invalid message role", { status: 400 });
    }
    if (typeof m.content === "string") {
      if (m.content.length > 400_000) return new Response("Message too long", { status: 400 });
    } else if (Array.isArray(m.content)) {
      if (m.content.length > 20) return new Response("Too many content parts", { status: 400 });
    } else {
      return new Response("Invalid message content", { status: 400 });
    }
  }

  if (!apiBaseUrl || !model || !Array.isArray(messages)) {
    return new Response("Missing required fields: apiBaseUrl, model, messages[]", { status: 400 });
  }

  // Local providers (Ollama, LM Studio, anything on localhost/127.0.0.1) don't need a real key.
  const needsKey = !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));
  if (needsKey && !apiKey) {
    return new Response("Missing API key for this provider. Add one in Settings → Model Provider, or use a local provider like Ollama / LM Studio.", { status: 400 });
  }

  const provider = detectProvider(apiBaseUrl);
  let request;
  try {
    request = buildProviderRequest(provider, {
      apiBase: apiBaseUrl,
      apiKey: apiKey || "no-key-needed",
      model,
      messages,
      systemPrompt,
      temperature: typeof temperature === "number" ? temperature : 0.7,
      stream: !!stream,
      max_tokens,
      tools,
      tool_choice,
    });
  } catch (e) {
    return new Response(scrubKey(`Failed to build request: ${String(e?.message || e)}`), { status: 500 });
  }

  let upstream;
  try {
    upstream = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
  } catch (e) {
    return new Response(scrubKey(`Upstream fetch failed: ${String(e?.message || e)}`), { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(scrubKey(text) || `Upstream error ${upstream.status}`, {
      status: upstream.status || 500,
      headers: { "Content-Type": upstream.headers.get("content-type") || "text/plain" },
    });
  }

  // OpenAI-compatible family: pass through untouched
  if (request.isOpenAIFormat) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Native adapters: translate unified events to OpenAI-style SSE
  const adapter = request.translate;
  const encoder = new TextEncoder();
  const translatedStream = new ReadableStream({
    async start(controller) {
      try {
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const id = "chatcmpl-" + Math.random().toString(36).slice(2, 10);
        const created = Math.floor(Date.now() / 1000);
        const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        send({ id, object: "chat.completion.chunk", created, model: "", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });

        try {
          for await (const ev of adapter(reader)) {
            if (ev.type === "delta") {
              send({ id, object: "chat.completion.chunk", created, model: "", choices: [{ index: 0, delta: { content: ev.text }, finish_reason: null }] });
            } else if (ev.type === "thinking") {
              send({ id, object: "chat.completion.chunk", created, model: "", choices: [{ index: 0, delta: { reasoning_content: ev.text }, finish_reason: null }] });
            } else if (ev.type === "usage") {
              send({ id, object: "chat.completion.chunk", created, model: "", choices: [{ index: 0, delta: {}, finish_reason: null }], usage: { prompt_tokens: ev.promptTokens, completion_tokens: ev.completionTokens, total_tokens: ev.promptTokens + ev.completionTokens } });
            } else if (ev.type === "error") {
              send({ error: { message: scrubKey(ev.message), detail: scrubKey(ev.detail) } });
            } else if (ev.type === "done") {
              send({ id, object: "chat.completion.chunk", created, model: "", choices: [{ index: 0, delta: {}, finish_reason: ev.reason || "stop" }] });
            }
          }
        } catch (e) {
          send({ error: { message: "Stream error", detail: String(e?.message || e) } });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(translatedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// Test connection: send a tiny ping to the provider and report success/failure.

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
  const blocked = guard(req, { rateKey: "test-conn", rateMax: 15, maxBody: 64 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const { apiBaseUrl, apiKey, apiModel } = body || {};
  if (!apiBaseUrl || !apiModel) return Response.json({ ok: false, error: "Missing apiBaseUrl or apiModel" }, { status: 400 });
  {
    const urlBad = providerUrlGuard(String(apiBaseUrl));
    if (urlBad) return Response.json({ ok: false, error: `apiBaseUrl rejected: ${urlBad}` }, { status: 400 });
  }

  const provider = detectProvider(apiBaseUrl);
  let request;
  try {
    request = buildProviderRequest(provider, {
      apiBase: apiBaseUrl,
      apiKey: apiKey || "no-key-needed",
      model: apiModel,
      messages: [{ role: "user", content: "Reply with just the word: pong" }],
      systemPrompt: "You are a test echo. Reply with the single word: pong",
      temperature: 0,
      stream: false,
      // Reasoning/thinking models (GLM-reasoner, DeepSeek-R1, Claude thinking…)
      // spend the budget on hidden reasoning first — 10 tokens produced an
      // empty visible reply and a false "no content" failure. 300 is enough.
      max_tokens: 300,
    });
  } catch (e) {
    return Response.json({ ok: false, error: `Build request failed: ${String(e?.message || e)}` });
  }

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}`, provider });
    }
    // Native adapters (Anthropic, Google) always answer with an SSE stream —
    // res.json() there would throw even on a perfectly working key. Try JSON
    // first, fall back to extracting the reply from the SSE frames.
    const raw = await res.text();
    let reply = "";
    let model = "";
    try {
      const data = JSON.parse(raw);
      const msg = data.choices?.[0]?.message || {};
      // thinking models may answer only via reasoning_content — still a live
      // working connection, so accept it (marked as reasoning).
      reply = msg.content || msg.reasoning_content || "";
      model = data.model || "";
    } catch {
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const d = j.delta || j.choices?.[0]?.delta || {};
          if (typeof d.text === "string") reply += d.text; // anthropic text_delta
          else if (d.content) reply += d.content; // openai-style delta
          else if (d.reasoning_content) reply += d.reasoning_content; // thinking models
          const gp = j.candidates?.[0]?.content?.parts;
          if (Array.isArray(gp)) reply += gp.map((p) => p.text || "").join(""); // google
          if (!model) model = j.message?.model || j.model || "";
        } catch {}
      }
    }
    if (!reply.trim()) return Response.json({ ok: false, error: "Provider answered but returned no content (check the model id)", provider });
    return Response.json({ ok: true, provider, reply: reply.slice(0, 100), model });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e), provider });
  }
}

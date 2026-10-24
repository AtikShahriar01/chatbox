// Image generation proxy (BYOK, OpenAI-compatible /images/generations).
// Works with OpenAI and any compatible gateway exposing the images endpoint;
// the provider is detected from the baseUrl like /api/chat does.
// Results are normalized to data URLs (b64) so the strict img-src CSP
// ('self' data: blob:) can display them without allowing remote hosts.

import { detectProvider } from "../../../lib/providerMeta";
import { guard, providerUrlGuard } from "../../../lib/guard";
import { requireSession } from "../../../lib/session";

export const runtime = "nodejs";

const OPENAI_FAMILY = new Set([
  "openai", "openrouter", "groq", "deepseek", "mistral", "xai", "together", "fireworks", "openai-compatible",
]);

function scrubKey(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]{8,}/gi, "Bearer ***REDACTED***");
}

const SIZES = new Set(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792", "1536x1024", "1024x1536"]);

export async function POST(req) {
  const blocked = guard(req, { rateKey: "image", rateMax: 10, maxBody: 64 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    if (JSON.stringify(body || {}).length > 64 * 1024) {
      return new Response("body too large", { status: 413 });
    }
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { apiBaseUrl, apiKey, model, prompt, size, n } = body || {};

  if (typeof apiBaseUrl !== "string" || apiBaseUrl.length > 500 || !/^https?:\/\//i.test(apiBaseUrl)) {
    return new Response("Invalid apiBaseUrl", { status: 400 });
  }
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
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    return new Response("Invalid prompt (1–4000 chars)", { status: 400 });
  }
  if (size !== undefined && (typeof size !== "string" || !SIZES.has(size))) {
    return new Response("Invalid size", { status: 400 });
  }
  if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 4)) {
    return new Response("Invalid n (1–4)", { status: 400 });
  }

  const needsKey = !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));
  if (needsKey && !apiKey) {
    return new Response("Missing API key for this provider.", { status: 400 });
  }

  const provider = detectProvider(apiBaseUrl);
  if (!OPENAI_FAMILY.has(provider)) {
    return new Response(
      `Image generation needs an OpenAI-compatible provider (this endpoint looks like "${provider}"). Pick an image model such as dall-e-3 on an OpenAI-compatible base URL.`,
      { status: 400 }
    );
  }

  const url = `${apiBaseUrl.replace(/\/+$/, "")}/images/generations`;
  const payload = { model, prompt, n: n || 1, ...(size ? { size } : {}) };

  // gpt-image-1 always returns b64_json and REJECTS response_format; dall-e-*
  // accept response_format but default to short-lived hosted URLs, which the
  // CSP can't display. So: ask for b64 first, retry without it on a 400.
  let upstream = null;
  let lastErr = "";
  for (const withFormat of [true, false]) {
    const bodyStr = JSON.stringify(withFormat ? { ...payload, response_format: "b64_json" } : payload);
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: bodyStr,
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
    } catch (e) {
      return new Response(scrubKey(`Upstream fetch failed: ${String(e?.message || e)}`), { status: 502 });
    }
    if (upstream.ok) break;
    lastErr = await upstream.text().catch(() => "");
    if (upstream.status !== 400 || !withFormat) break;
  }

  if (!upstream || !upstream.ok) {
    return new Response(scrubKey(lastErr) || `Upstream error ${upstream?.status || 500}`, {
      status: upstream?.status || 500,
      headers: { "Content-Type": upstream?.headers.get("content-type") || "text/plain" },
    });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return new Response("Upstream returned invalid JSON", { status: 502 });
  }
  const items = Array.isArray(data?.data) ? data.data : [];
  const images = items
    .map((it) => (it?.b64_json ? `data:image/png;base64,${it.b64_json}` : typeof it?.url === "string" ? it.url : null))
    .filter(Boolean)
    .slice(0, 4);
  if (!images.length) {
    return new Response("Provider returned no images (check the model id — needs an image model like dall-e-3)", { status: 502 });
  }
  return Response.json({ ok: true, images, model: data.model || model });
}

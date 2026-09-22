// List available models from a provider's /v1/models endpoint.
// Returns { ok, models, error }.

import { detectProvider, PROVIDER_LABELS } from "../../../../lib/providerMeta";
import { guard, providerUrlGuard } from "../../../../lib/guard";
import { requireSession } from "../../../../lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  const blocked = guard(req, { rateKey: "models", rateMax: 20, maxBody: 64 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const { apiBaseUrl, apiKey } = body || {};
  if (typeof apiBaseUrl !== "string" || !apiBaseUrl || apiBaseUrl.length > 500 || !/^https?:\/\//i.test(apiBaseUrl)) {
    return Response.json({ ok: false, error: "Missing/invalid apiBaseUrl" }, { status: 400 });
  }
  if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length > 1000)) {
    return Response.json({ ok: false, error: "Invalid apiKey" }, { status: 400 });
  }
  // SSRF (§11): chat/test-connection-এর মতো এখানেও metadata/private টার্গেট ব্লক
  {
    const urlBad = providerUrlGuard(String(apiBaseUrl));
    if (urlBad) return Response.json({ ok: false, error: `apiBaseUrl rejected: ${urlBad}` }, { status: 400 });
  }

  const provider = detectProvider(apiBaseUrl);
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // Anthropic native uses x-api-key
  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  try {
    let url, dataPath;
    if (provider === "anthropic") {
      url = `${apiBaseUrl.replace(/\/+$/, "")}/v1/models?limit=100`;
    } else if (provider === "google") {
      // Gemini: GET /v1beta/models?key=API_KEY
      url = `${apiBaseUrl.replace(/\/+$/, "")}/v1beta/models?key=${encodeURIComponent(apiKey || "")}`;
    } else {
      let base = apiBaseUrl.replace(/\/+$/, "");
      // OpenAI-style APIs serve /models under /v1. If the user gave a bare host
      // (e.g. https://api.openai.com) without the /v1 suffix, the first try 404s —
      // we retry with /v1/models below.
      url = `${base}/models`;
    }

    let res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if ((res.status === 404 || res.status === 400) && provider !== "anthropic" && provider !== "google") {
      const retryUrl = `${apiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/models`;
      if (retryUrl !== url) {
        res = await fetch(retryUrl, { headers, signal: AbortSignal.timeout(15000) });
      }
    }
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` });
    }
    const data = await res.json();

    let models = [];
    if (Array.isArray(data.data)) {
      models = data.data.map((m) => m.id || m.name).filter(Boolean);
    } else if (Array.isArray(data.models)) {
      // Google
      models = data.models.map((m) => (m.name || "").replace(/^models\//, "")).filter(Boolean);
    }

    return Response.json({ ok: true, provider, providerName: PROVIDER_LABELS[provider]?.name, models });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
}

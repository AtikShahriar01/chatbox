// Document chat (RAG-lite) — ingest + semantic retrieval over the user's own
// OpenAI-compatible embeddings endpoint.
//
//   POST { op: "ingest", apiBaseUrl, apiKey, model, name, dataBase64 }
//     → extract text (pdf / plain text), chunk, embed once, cache server-side
//     → { ok, docId, name, chunks, chars, dims }
//   POST { op: "query", apiBaseUrl, apiKey, model, docId, query, k }
//     → embed the query, cosine-rank the doc's chunks
//     → { ok, chunks: [{ text, score }] }
//
// The vector cache is in-memory and session-scoped: documents live until the
// server restarts (re-attach the file to re-ingest). BYOK keys pass through
// the same guard/session/SSRF layers as /api/chat.

import { guard, providerUrlGuard } from "../../../lib/guard";
import { requireSession } from "../../../lib/session";
import { detectProvider } from "../../../lib/providerMeta";
// lib/ entry skips pdf-parse's CLI-only debug probe (which would otherwise try
// to read a test PDF when treated as the main module).
import PdfParse from "pdf-parse/lib/pdf-parse.js";

export const runtime = "nodejs";

const OPENAI_FAMILY = new Set([
  "openai", "openrouter", "groq", "deepseek", "mistral", "xai", "together", "fireworks", "openai-compatible",
]);

const MAX_DOC_BYTES = 6 * 1024 * 1024;      // decoded file size
const MAX_CHUNKS = 120;                      // ~135 KB of text max per doc
const CHUNK_CHARS = 1100;
const CHUNK_OVERLAP = 150;
const MAX_DOCS = 20;                         // LRU eviction

function scrubKey(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]{8,}/gi, "Bearer ***REDACTED***");
}

// ---- server-side vector cache ---------------------------------------------
const docs = new Map(); // docId → { name, chunks: [{ text, vec: Float32Array }], at }
function cacheSet(id, doc) {
  docs.set(id, doc);
  while (docs.size > MAX_DOCS) {
    const oldest = [...docs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    docs.delete(oldest[0]);
  }
}

// ---- text extraction -------------------------------------------------------
function extractText(buffer, name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".pdf")) {
    return PdfParse(buffer).then((d) => String(d.text || ""));
  }
  // Binary sniff: NUL bytes in the first 4 KB mean this isn't text.
  const head = buffer.subarray(0, 4096);
  let nulls = 0;
  for (const b of head) if (b === 0) nulls++;
  if (nulls > 8) throw new Error("Unsupported binary file — attach text, code, markdown or PDF files.");
  return Promise.resolve(buffer.toString("utf8"));
}

// Paragraph/line-aware chunking with a small overlap for context continuity.
function chunkText(text) {
  const clean = String(text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > CHUNK_CHARS && cur) {
      chunks.push(cur.trim());
      // keep the tail for overlap
      cur = cur.slice(-CHUNK_OVERLAP) + "\n\n" + p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  // very long single paragraphs get hard-split
  const out = [];
  for (const c of chunks) {
    if (c.length <= CHUNK_CHARS * 1.5) out.push(c);
    else for (let i = 0; i < c.length; i += CHUNK_CHARS) out.push(c.slice(i, i + CHUNK_CHARS));
  }
  return out.slice(0, MAX_CHUNKS);
}

// ---- embeddings -------------------------------------------------------------
async function embed(apiBaseUrl, apiKey, model, inputs) {
  const url = `${apiBaseUrl.replace(/\/+$/, "")}/embeddings`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ ...(model ? { model } : {}), input: inputs }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Embeddings API ${res.status}: ${scrubKey(text).slice(0, 300)}`);
  }
  const data = await res.json();
  const vecs = (data?.data || []).map((d) => d.embedding);
  if (!vecs.length || vecs.length !== inputs.length) {
    throw new Error("Embeddings API returned no vectors — set an embedding model (e.g. text-embedding-3-small) in Settings → Model Provider.");
  }
  return vecs;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---- route -------------------------------------------------------------------
export async function POST(req) {
  const blocked = guard(req, { rateKey: "doc", rateMax: 12, maxBody: 10 * 1024 * 1024 });
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
    if (JSON.stringify(body || {}).length > 10 * 1024 * 1024) return new Response("body too large", { status: 413 });
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { op, apiBaseUrl, apiKey, model, name, dataBase64, docId, query, k } = body || {};
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.length > 500 || !/^https?:\/\//i.test(apiBaseUrl)) {
    return new Response("Invalid apiBaseUrl", { status: 400 });
  }
  {
    const urlBad = providerUrlGuard(apiBaseUrl);
    if (urlBad) return new Response(`apiBaseUrl rejected: ${urlBad}`, { status: 400 });
  }
  if (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length > 1000)) {
    return new Response("Invalid apiKey", { status: 400 });
  }
  const needsKey = !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("ollama") || apiBaseUrl.includes("1234") || apiBaseUrl.includes("lm-studio") || apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));
  if (needsKey && !apiKey) return new Response("Missing API key for this provider.", { status: 400 });

  const provider = detectProvider(apiBaseUrl);
  if (!OPENAI_FAMILY.has(provider)) {
    return new Response(`Document chat needs an OpenAI-compatible embeddings endpoint (detected "${provider}").`, { status: 400 });
  }

  try {
    if (op === "ingest") {
      if (typeof dataBase64 !== "string" || !dataBase64) return new Response("Missing file data", { status: 400 });
      if (typeof name !== "string" || name.length > 200) return new Response("Invalid name", { status: 400 });
      const buffer = Buffer.from(dataBase64.replace(/^data:[^;]*;base64,/, ""), "base64");
      if (!buffer.length || buffer.length > MAX_DOC_BYTES) {
        return new Response(`File is empty or over ${MAX_DOC_BYTES / 1024 / 1024} MB`, { status: 400 });
      }
      const text = await extractText(buffer, name);
      const chunks = chunkText(text);
      if (!chunks.length) return new Response("No readable text found in this file.", { status: 400 });
      const vecs = await embed(apiBaseUrl, apiKey, model, chunks);
      const id = "doc_" + Math.random().toString(36).slice(2, 12);
      cacheSet(id, {
        name: name.slice(0, 200),
        at: Date.now(),
        chunks: chunks.map((text, i) => ({ text, vec: Float32Array.from(vecs[i]) })),
      });
      return Response.json({ ok: true, docId: id, name, chunks: chunks.length, chars: text.length, dims: vecs[0].length });
    }

    if (op === "query") {
      const doc = docs.get(String(docId || ""));
      if (!doc) return new Response("Document not in cache — re-attach the file.", { status: 404 });
      if (typeof query !== "string" || !query.trim() || query.length > 4000) return new Response("Invalid query", { status: 400 });
      const [qv] = await embed(apiBaseUrl, apiKey, model, [query.slice(0, 4000)]);
      const top = Number.isInteger(k) && k >= 1 && k <= 8 ? k : 4;
      const ranked = doc.chunks
        .map((c) => ({ text: c.text, score: cosine(qv, c.vec) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, top)
        .filter((c) => c.score > 0.1);
      return Response.json({ ok: true, chunks: ranked, name: doc.name });
    }

    return new Response("Unknown op (ingest | query)", { status: 400 });
  } catch (e) {
    return new Response(scrubKey(String(e?.message || e)), { status: 502 });
  }
}

// Ollama (local) provider.
// Ollama supports both native (/api/chat) and OpenAI-compatible (/v1/chat/completions) endpoints.
// We use the OpenAI-compatible path for simplicity — Ollama started serving that endpoint in v0.1.14+.
// For native path, the body shape is { model, messages, stream, options: { temperature } } and the
// stream is NDJSON (not SSE). We expose a translator for both.

export function buildOllamaRequest({ model, messages, temperature, stream, apiBase }) {
  // Use OpenAI-compat endpoint for consistency with the rest of the app.
  return {
    url: `${apiBase.replace(/\/+$/, "")}/chat/completions`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      model,
      messages,
      temperature,
      stream: !!stream,
    },
    translate: parseOpenAISSE, // reuse
  };
}

// Re-export the OpenAI SSE parser for convenience.
export { parseOpenAISSE } from "./openai";

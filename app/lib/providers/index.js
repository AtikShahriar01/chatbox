// Provider adapters. Each one knows how to talk to one LLM service's
// native streaming chat API and emit a unified stream of events:
//   { type: "delta", text }
//   { type: "thinking", text }
//   { type: "usage", promptTokens, completionTokens }
//   { type: "done" }
//   { type: "error", message, detail }
//
// The client picks an adapter based on the apiBaseUrl hostname, and the
// /api/chat route forwards raw upstream bytes for the OpenAI-compatible
// family. For native adapters (Anthropic, Google, Cohere), the route
// translates the upstream SSE into OpenAI-style deltas on the wire so
// the browser code stays simple.

export * from "./openai";
export * from "./anthropic";
export * from "./google";
export * from "./ollama";
export * from "./cohere";

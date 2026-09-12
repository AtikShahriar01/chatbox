// Server-safe provider detection. No "use client" — usable from route handlers.
// Mirrors detectProvider from lib/store.js for use in API routes.

export function detectProvider(baseUrl) {
  if (!baseUrl) return "openai-compatible";
  const u = baseUrl.toLowerCase();
  if (u.includes("api.openai.com")) return "openai";
  if (u.includes("api.anthropic.com")) return "anthropic";
  if (u.includes("generativelanguage.googleapis.com")) return "google";
  if (u.includes("api.groq.com") || u.includes("groq.com")) return "groq";
  if (u.includes("api.deepseek.com") || u.includes("deepseek.com")) return "deepseek";
  if (u.includes("api.mistral.ai") || u.includes("mistral.ai")) return "mistral";
  if (u.includes("api.x.ai") || u.includes("api.grok") || u.includes("x.ai")) return "xai";
  if (u.includes("api.cohere.ai") || u.includes("cohere.ai")) return "cohere";
  if (u.includes("api.together.xyz") || u.includes("together.xyz")) return "together";
  if (u.includes("api.fireworks.ai") || u.includes("fireworks.ai")) return "fireworks";
  if (u.includes("openrouter.ai")) return "openrouter";
  if (u.includes("11434") || u.includes("ollama")) return "ollama";
  if (u.includes("1234") || u.includes("lmstudio") || u.includes("lm-studio")) return "lmstudio";
  if (u.includes("tokenrouter")) return "openai-compatible"; // tokenrouter is OpenAI-compatible
  return "openai-compatible";
}

export const PROVIDER_LABELS = {
  "openai": { name: "OpenAI", protocol: "OpenAI", hint: "Uses Authorization: Bearer header and /v1/chat/completions endpoint." },
  "openai-compatible": { name: "OpenAI-compatible", protocol: "OpenAI", hint: "Any service that speaks the OpenAI Chat Completions API." },
  "openrouter": { name: "OpenRouter", protocol: "OpenAI", hint: "OpenRouter — one key, 100+ models." },
  "anthropic": { name: "Anthropic Claude", protocol: "Anthropic Native", hint: "Uses x-api-key + anthropic-version headers and /v1/messages endpoint." },
  "google": { name: "Google Gemini", protocol: "Google Native", hint: "Uses ?key= query param and /v1beta/models/{model}:streamGenerateContent?alt=sse." },
  "groq": { name: "Groq", protocol: "OpenAI", hint: "Ultra-fast LPU inference. OpenAI-compatible." },
  "deepseek": { name: "DeepSeek", protocol: "OpenAI", hint: "DeepSeek V3. OpenAI-compatible." },
  "mistral": { name: "Mistral AI", protocol: "OpenAI", hint: "OpenAI-compatible." },
  "xai": { name: "xAI (Grok)", protocol: "OpenAI", hint: "OpenAI-compatible at https://api.x.ai/v1." },
  "cohere": { name: "Cohere", protocol: "Cohere Native", hint: "Uses /v2/chat with Cohere's native message format." },
  "together": { name: "Together AI", protocol: "OpenAI", hint: "OpenAI-compatible. Many open-source models." },
  "fireworks": { name: "Fireworks AI", protocol: "OpenAI", hint: "OpenAI-compatible. Fast inference." },
  "ollama": { name: "Ollama (local)", protocol: "OpenAI-compat", hint: "Local models. No API key needed. Install from https://ollama.com then 'ollama pull llama3.1'." },
  "lmstudio": { name: "LM Studio (local)", protocol: "OpenAI-compat", hint: "Local models. No API key needed. Start the local server in LM Studio." },
};

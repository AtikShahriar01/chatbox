// OpenAI / OpenAI-compatible provider.
// Used for: OpenAI, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, LM Studio, vLLM, etc.
// Stream format: SSE with `data: {json}\n\n` lines, terminated by `data: [DONE]`.

export function buildOpenAIRequest({ model, messages, temperature, stream, max_tokens, tools, tool_choice, apiKey, apiBase, protocol = "openai" }) {
  return {
    url: `${apiBase.replace(/\/+$/, "")}/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      messages,
      temperature,
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(max_tokens ? { max_tokens } : {}),
      ...(tools ? { tools } : {}),
      ...(tools && tool_choice ? { tool_choice } : {}),
    },
    // Translate OpenAI SSE frames to unified events
    translate: parseOpenAISSE,
    isOpenAIFormat: true,
  };
}

export async function* parseOpenAISSE(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const choice = json.choices?.[0];
        if (!choice) {
          if (json.usage) {
            yield { type: "usage", promptTokens: json.usage.prompt_tokens || 0, completionTokens: json.usage.completion_tokens || 0 };
          }
          continue;
        }
        const delta = choice.delta || {};
        // Some providers (tokenrouter/glm, deepseek-reasoner) put everything in reasoning_content
        // and leave content empty. Treat the first non-empty chunk as visible if no content arrives
        // within a few frames. We just emit both kinds and the UI shows reasoning + content.
        if (delta.reasoning_content) yield { type: "thinking", text: delta.reasoning_content };
        if (delta.content) yield { type: "delta", text: delta.content };
        if (choice.finish_reason) yield { type: "done", reason: choice.finish_reason };
        if (json.usage) {
          yield { type: "usage", promptTokens: json.usage.prompt_tokens || 0, completionTokens: json.usage.completion_tokens || 0 };
        }
      } catch {
        // ignore non-JSON keepalive lines
      }
    }
  }
}

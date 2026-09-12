// Cohere native provider.
// Endpoint: POST {baseUrl}/v2/chat
// Body:     { model, messages: [{role, content}], stream: true }
// Stream:   SSE with typed events: stream-start, text-generation, citation-generation, tool-calls-generation, stream-end, error

export function buildCohereRequest({ model, messages, systemPrompt, temperature, stream, apiKey, apiBase }) {
  // Cohere v2 wants system as a separate message with role:"system"
  const chatMessages = [];
  if (systemPrompt) chatMessages.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (m.role === "system") continue;
    chatMessages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : (m.content?.[0]?.text || ""),
    });
  }
  return {
    url: `${apiBase.replace(/\/+$/, "")}/v2/chat`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: stream ? "text/event-stream" : "application/json",
    },
    body: {
      model,
      messages: chatMessages,
      temperature: typeof temperature === "number" ? temperature : 0.7,
      stream: !!stream,
    },
    translate: parseCohereSSE,
  };
}

export async function* parseCohereSSE(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  let event = null; // kept across reads: a chunk boundary may fall between "event:" and "data:" lines
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:") && event) {
        const payload = line.slice(5).trim();
        try {
          const json = JSON.parse(payload);
          switch (event) {
            case "text-generation":
              if (json.text) yield { type: "delta", text: json.text };
              break;
            case "stream-end":
              if (json.response?.usage) {
                yield { type: "usage", promptTokens: json.response.usage.input_tokens || 0, completionTokens: json.response.usage.output_tokens || 0 };
              }
              yield { type: "done", reason: "complete" };
              return;
            case "error":
              yield { type: "error", message: json.message || "Cohere error", detail: JSON.stringify(json) };
              return;
            default:
              break;
          }
        } catch {}
        event = null;
      } else if (line === "") {
        event = null;
      }
    }
  }
}

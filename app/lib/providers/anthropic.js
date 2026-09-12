// Anthropic Claude native provider.
// Endpoint: POST {baseUrl}/v1/messages
// Headers:  x-api-key, anthropic-version: 2023-06-01, content-type
// Body:     { model, system, messages: [{role, content: [{type:"text",text}]}], max_tokens, temperature, stream: true }
// Stream:   SSE with typed events:
//   message_start, content_block_start, content_block_delta (text_delta / thinking_delta / input_json_delta),
//   content_block_stop, message_delta (stop_reason, usage), message_stop, error, ping
//
// We translate the SSE stream to the unified event format.

export function buildAnthropicRequest({ model, messages, systemPrompt, temperature, stream, max_tokens, apiKey, apiBase }) {
  // Anthropic takes system as a top-level field; strip any system message from the list
  const cleanedMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content,
    }));

  return {
    url: `${apiBase.replace(/\/+$/, "")}/v1/messages`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: {
      model,
      system: systemPrompt || "You are a helpful assistant.",
      messages: cleanedMessages,
      max_tokens: max_tokens || 4096,
      temperature: typeof temperature === "number" ? temperature : 0.7,
      stream: true,
    },
    translate: parseAnthropicSSE,
  };
}

export async function* parseAnthropicSSE(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0; // message_start carries input_tokens; message_delta carries output_tokens
  let event = null; // kept across reads: a chunk boundary may fall between "event:" and "data:" lines
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:") && event) {
        const payload = line.slice(5).trim();
        try {
          const json = JSON.parse(payload);
          switch (event) {
            case "message_start": {
              promptTokens = json.message?.usage?.input_tokens || promptTokens;
              break;
            }
            case "content_block_start": {
              if (json.content_block?.type === "thinking") {
                // begin a thinking block; we yield deltas as they arrive
              }
              break;
            }
            case "content_block_delta": {
              const d = json.delta;
              if (d?.type === "text_delta") yield { type: "delta", text: d.text };
              else if (d?.type === "thinking_delta") yield { type: "thinking", text: d.thinking };
              break;
            }
            case "message_delta": {
              if (json.usage) {
                yield { type: "usage", promptTokens, completionTokens: json.usage.output_tokens || 0 };
              }
              if (json.delta?.stop_reason) yield { type: "done", reason: json.delta.stop_reason };
              break;
            }
            case "message_stop":
              return;
            case "error":
              yield { type: "error", message: json.error?.message || "Anthropic error", detail: JSON.stringify(json) };
              return;
            default:
              break;
          }
        } catch {
          // ignore non-JSON
        }
        event = null;
      } else if (line === "") {
        event = null;
      }
    }
  }
}

// Non-streaming translation helpers: convert native JSON responses (and
// misbehaving SSE responses) into the OpenAI completion shape, so a
// stream:false call to /api/chat (callModel: agent engine, classifyTask,
// compileFinal) returns one uniform response shape for every provider.

export function nativeJSONToOpenAI(provider, data) {
  if (provider === "anthropic") {
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter((b) => b?.type === "text").map((b) => b.text || "").join("");
    const thinking = blocks.filter((b) => b?.type === "thinking").map((b) => b.thinking || "").join("");
    return {
      model: data.model || "",
      choices: [{
        message: { role: "assistant", content: text, ...(thinking ? { reasoning_content: thinking } : {}) },
        // callModel() treats finish_reason "length" as truncation.
        finish_reason: data.stop_reason === "max_tokens" ? "length" : "stop",
      }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
      },
    };
  }
  if (provider === "google") {
    const cand = data.candidates?.[0] || {};
    const text = (cand.content?.parts || []).filter((p) => p?.text).map((p) => p.text).join("");
    return {
      model: data.modelVersion || "",
      choices: [{
        message: { role: "assistant", content: text },
        finish_reason: cand.finishReason === "MAX_TOKENS" ? "length" : "stop",
      }],
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }
  if (provider === "cohere") {
    const text = (Array.isArray(data.message?.content) ? data.message.content : [])
      .filter((b) => b?.text).map((b) => b.text).join("");
    return {
      model: data.model || "",
      choices: [{
        message: { role: "assistant", content: text },
        finish_reason: data.finish_reason === "MAX_TOKENS" ? "length" : "stop",
      }],
      usage: {
        prompt_tokens: data.usage?.billed_units?.input_tokens || data.usage?.tokens?.input_tokens || 0,
        completion_tokens: data.usage?.billed_units?.output_tokens || data.usage?.tokens?.output_tokens || 0,
      },
    };
  }
  return data; // OpenAI-compatible family already speaks this shape
}

// Salvage text from SSE frames when a provider answers with a stream even
// though stream:false was requested.
export function textFromSSEFrames(raw) {
  let content = "";
  let reasoning = "";
  for (const line of String(raw || "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const j = JSON.parse(payload);
      const d = j.delta || j.choices?.[0]?.delta || {};
      if (typeof d.text === "string") content += d.text; // anthropic/cohere text
      if (d.content) content += d.content; // openai-style delta
      if (d.reasoning_content) reasoning += d.reasoning_content;
      const parts = j.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) content += parts.map((p) => p.text || "").join(""); // google
    } catch {}
  }
  return { content, reasoning };
}

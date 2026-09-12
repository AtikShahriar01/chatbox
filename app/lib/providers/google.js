// Google Gemini native provider.
// Endpoint: POST {baseUrl}/v1beta/models/{model}:streamGenerateContent?alt=sse
// Auth:     ?key={apiKey} (query param, NOT a header)
// Body:     { contents: [{role:"user"|"model", parts:[{text}]}], systemInstruction: {parts:[{text}]}, generationConfig: {temperature, maxOutputTokens} }
// Stream:   SSE with a sequence of JSON objects {candidates:[{content:{parts:[{text}]}}], usageMetadata:{...}}
//
// We translate to unified events.

export function buildGoogleRequest({ model, messages, systemPrompt, temperature, stream, max_tokens, apiKey, apiBase }) {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : (m.content?.[0]?.text || "") }],
    }));

  return {
    url: `${apiBase.replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      contents,
      ...(systemPrompt ? { systemInstruction: { role: "system", parts: [{ text: systemPrompt }] } } : {}),
      generationConfig: {
        temperature: typeof temperature === "number" ? temperature : 0.7,
        ...(max_tokens ? { maxOutputTokens: max_tokens } : {}),
      },
    },
    translate: parseGoogleSSE,
  };
}

export async function* parseGoogleSSE(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const parts = json.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.text) {
            // Heuristic: if thought===true, treat as thinking
            if (p.thought) yield { type: "thinking", text: p.text };
            else yield { type: "delta", text: p.text };
          }
        }
        if (json.candidates?.[0]?.finishReason) yield { type: "done", reason: json.candidates[0].finishReason };
        if (json.usageMetadata) {
          yield { type: "usage", promptTokens: json.usageMetadata.promptTokenCount || 0, completionTokens: json.usageMetadata.candidatesTokenCount || 0 };
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

// Mock OpenAI-compatible provider for REAL end-to-end testing of the Chatbox API.
// Listens on 127.0.0.1:18787. Speaks OpenAI Chat Completions + /v1/models.
const http = require("http");

const PORT = 18787;

function sseChunks(res, model, text, withDelay) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const id = "chatcmpl-mock123";
  const created = Math.floor(Date.now() / 1000);
  const pieces = text.split(" ");
  let i = 0;
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  const next = () => {
    if (i < pieces.length) {
      const piece = pieces[i] + (i < pieces.length - 1 ? " " : "");
      send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] });
      i++;
      setTimeout(next, withDelay ? 40 : 0);
    } else {
      send({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: pieces.length, total_tokens: 12 + pieces.length } });
      res.write("data: [DONE]\n\n");
      res.end();
    }
  };
  next();
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = {};
    try { parsed = JSON.parse(body || "{}"); } catch {}

    if (req.url === "/v1/models" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "mock-fast" }, { id: "mock-big" }] }));
    }

    if (req.url === "/v1/chat/completions" && req.method === "POST") {
      const model = parsed.model || "mock-fast";
      if (model === "mock-error") {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Mock internal error for testing" } }));
      }
      const reply = model === "mock-pong" ? "pong" : "Hello from mock provider";
      if (parsed.stream) return sseChunks(res, model, reply, true);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        id: "chatcmpl-mock123", object: "chat.completion", created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }));
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "not found: " + req.url } }));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[mock] OpenAI-compatible provider on http://127.0.0.1:${PORT}/v1`));

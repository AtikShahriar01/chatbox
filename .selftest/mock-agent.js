// Scripted AGENT-protocol mock: replies with the JSON actions the autonomous
// agent engine expects, publishing a set_todo checklist that ticks off over
// turns — used to E2E-test the live todo-list UI.
const http = require("http");
const PORT = 18788;
let turn = 0;
const seq = [
  { thought: "plan first", tool: "set_todo", items: [
    { text: "Inspect the workspace", status: "pending" },
    { text: "Write calc-e2e.py", status: "pending" },
    { text: "Run and verify output", status: "pending" },
  ] },
  { thought: "starting", tool: "set_todo", items: [
    { text: "Inspect the workspace", status: "done" },
    { text: "Write calc-e2e.py", status: "doing" },
    { text: "Run and verify output", status: "pending" },
  ] },
  { thought: "write file", tool: "write_file", path: "calc-e2e.py", content: "print('e2e-ok', 2+2)\n" },
  { thought: "file written", tool: "set_todo", items: [
    { text: "Inspect the workspace", status: "done" },
    { text: "Write calc-e2e.py", status: "done" },
    { text: "Run and verify output", status: "doing" },
  ] },
  { thought: "run it", tool: "run_command", command: "python calc-e2e.py" },
  { thought: "verified", tool: "set_todo", items: [
    { text: "Inspect the workspace", status: "done" },
    { text: "Write calc-e2e.py", status: "done" },
    { text: "Run and verify output", status: "done" },
  ] },
  { thought: "all verified", done: "calc-e2e.py তৈরি, রান করা হয়েছে, আউটপুট যাচাই সম্পন্ন ✅" },
];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "agent-mock" }] }));
    }
    if (req.url === "/v1/chat/completions") {
      const action = seq[Math.min(turn, seq.length - 1)];
      turn += 1;
      // slow replies (~2.5s) so the live todo checklist is visibly ticking
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "cmpl-m", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: "agent-mock",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(action) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
      }, 2500);
      return;
    }
    res.writeHead(404); res.end();
  });
}).listen(PORT, "127.0.0.1", () => console.log(`[mock-agent] on http://127.0.0.1:${PORT}/v1`));

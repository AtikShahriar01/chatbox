// §20 E2E layer — end-to-end user journeys over the REAL services:
//   login-gate → chat round-trip → IDE file edit + git → autonomous agent
//   workflow (driven through mock-agent 18788, executing the exact provider
//   contract the browser engine follows: chat → tool-call JSON → /api/pc).
// Browser-click UI E2E is covered separately by the live todo-panel demo;
// this suite automates the service level so it can run headless in CI.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Suite, WS, api, forgeSession, portOpen, startMock, stopMock, freshDir, rmrf } from "./helpers.mjs";

const s = new Suite("e2e");
const COOKIE = forgeSession();
const pc = (op, params = {}) => api("/api/pc", { method: "POST", cookie: COOKIE, body: { op, ...params } });
if (!(await portOpen(3000)) || !(await portOpen(8765))) {
  console.log("FATAL: app (:3000) or bridge (:8765) not running");
  process.exit(2);
}

async function killPort(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p} | findstr LISTENING`).toString();
    const pid = out.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
  } catch {}
}

const savedWs = fs.existsSync(path.join(WS, "agent-bridge", "bridge-workspace.txt"))
  ? fs.readFileSync(path.join(WS, "agent-bridge", "bridge-workspace.txt"), "utf8").trim() : WS;

try {
  // =============================================== JOURNEY: login gate ======
  {
    let r = await api("/");
    s.record("E2E-LOGIN", "cold visit → redirected to /login",
      (r.status === 307 || r.status === 302) && /login/.test(r.headers.get("location") || ""), `${r.status} → ${r.headers.get("location")}`);
    r = await api("/login");
    s.record("E2E-LOGIN", "login page renders (client-gated shell delivered)",
      r.status === 200 && /<!DOCTYPE html/i.test(r.text) && /_next\/static/.test(r.text) && r.text.length > 2000);
    r = await api("/", { cookie: COOKIE });
    s.record("E2E-LOGIN", "authenticated visit loads the app shell", r.status === 200 && /<div id|__next|<!DOCTYPE html/i.test(r.text) && !r.headers.get("location"));
    r = await api("/api/auth", { cookie: COOKIE });
    s.record("E2E-LOGIN", "app bootstraps already-authenticated session", r.json()?.authenticated === true);
  }

  // ================================================= JOURNEY: chat round-trip =
  let mockP = null;
  if (!(await portOpen(18787))) mockP = await startMock("mock-provider.js", 18787);
  {
    const convo = [{ role: "user", content: "hello there" }];
    let r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", model: "mock-fast", stream: false, messages: convo } });
    s.record("E2E-CHAT", "assistant answers first message", r.status === 200 && r.text.includes("Hello from mock provider"));
    convo.push({ role: "assistant", content: "Hello from mock provider" }, { role: "user", content: "and again" });
    r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", model: "mock-pong", stream: false, messages: convo } });
    s.record("E2E-CHAT", "multi-turn follow-up answers (context passes through)", r.text.includes("pong"));
  }
  if (mockP) stopMock(mockP);

  // ============================================ JOURNEY: IDE edit + git ======
  const ide = freshDir(path.join(WS, ".selftest", "e2e-ide"));
  {
    await pc("/workspace", { path: ide });
    let r = await pc("/file/write", { path: "todo-app/index.html", content: "<html><body><ul id='l'></ul></body></html>" });
    s.record("E2E-IDE", "create project file through IDE pipeline", r.json()?.ok === true);
    r = await pc("/file/edit", { path: "todo-app/index.html", search: "</ul>", replace: "<li>task</li></ul>" });
    s.record("E2E-IDE", "edit file", r.json()?.ok === true);
    r = await pc("/file/read", { path: "todo-app/index.html" });
    s.record("E2E-IDE", "content after edit is exactly expected",
      r.json()?.content === "<html><body><ul id='l'><li>task</li></ul></body></html>");
    execSync(`git init -q "${ide}" && git -C "${ide}" -c user.email=e@e -c user.name=e add . && git -C "${ide}" -c user.email=e@e -c user.name=e commit -qm base`, { stdio: "ignore" });
    r = await pc("/git/diff", { cwd: ide, staged: false });
    s.record("E2E-IDE", "git sees the working tree (diff after base commit clean)", r.json()?.ok === true);
    r = await pc("/git/status", { cwd: ide });
    s.record("E2E-IDE", "status after fresh commit is clean", /## master|## main/.test(String(r.json()?.stdout || "")) && !/\bM\b.*index\.html/.test(String(r.json()?.stdout || "")));
  }

  // =================================== JOURNEY: autonomous agent workflow ====
  let mockA = null;
  {
    await killPort(18788); // fresh turn counter every run
    mockA = await startMock("mock-agent.js", 18788);
    await pc("/workspace", { path: ide });
    const AGENT = { apiBaseUrl: "http://127.0.0.1:18788/v1", apiKey: "k", model: "agent-mock" };
    const messages = [{ role: "user", content: "create calc-e2e.py that prints the sum" }];
    let todos = [];
    let done = null;
    let ranOutput = null;
    let pythonOk = true;
    let retries = 0;
    for (let turn = 0; turn < 9 && !done; turn++) {
      const r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { ...AGENT, stream: false, messages } });
      if (r.status === 429) {
        // shared chat rate bucket (30/min) may be drained by earlier suites in
        // run-all — wait and replay THIS turn (the provider never saw it)
        if (++retries > 8) { s.record("E2E-AGENT", "chat rate-limit backoff exhausted", false); break; }
        turn--; await new Promise((x) => setTimeout(x, 12_000)); continue;
      }
      let action;
      try { action = JSON.parse((r.json()?.choices?.[0]?.message?.content || r.text).trim()); }
      catch { s.record("E2E-AGENT", `turn ${turn}: provider returned agent JSON`, false, r.text.slice(0, 80)); break; }
      if (!action || typeof action !== "object" || (!action.tool && !action.done)) {
        s.record("E2E-AGENT", `turn ${turn}: agent-contract action shape`, false, JSON.stringify(action).slice(0, 80)); break;
      }
      messages.push({ role: "assistant", content: JSON.stringify(action) });
      if (action.done) { done = action.done; break; }
      if (action.tool === "set_todo") { todos = action.items || []; continue; } // engine-local
      if (action.tool === "write_file") {
        const w = await pc("/file/write", { path: action.path, content: action.content });
        s.record("E2E-AGENT", `turn ${turn}: write_file ${action.path}`, w.json()?.ok === true);
      } else if (action.tool === "run_command") {
        if (action.command.startsWith("python ") && !pythonOk) continue;
        const x = await pc("/exec", { command: action.command, cwd: "" });
        ranOutput = String(x.json()?.stdout || "").trim();
        if (x.json()?.ok === false && /python/i.test(String(x.json()?.error || ""))) pythonOk = false;
        s.record("E2E-AGENT", `turn ${turn}: run_command "${action.command}"`,
          x.json()?.ok === true && /e2e-ok 4/.test(ranOutput), `stdout="${ranOutput.slice(0, 30)}"`);
      }
    }
    s.record("E2E-AGENT", "agent reached a terminal done-summary", !!done && /✅|verified|সম্পন্ন/i.test(done), String(done).slice(0, 60));
    s.record("E2E-AGENT", "live todo checklist ticked to all-done",
      todos.length === 3 && todos.every((t) => t.status === "done"), JSON.stringify(todos.map((t) => t.status)));
    s.record("E2E-AGENT", "artifact exists on disk with runnable content",
      fs.readFileSync(path.join(ide, "calc-e2e.py"), "utf8").includes("2+2"));
  }
  if (mockA) stopMock(mockA);

  await pc("/workspace", { path: savedWs || WS });
  rmrf(ide);
} finally {
  await pc("/workspace", { path: savedWs || WS }).catch(() => {});
}

await s.finish();

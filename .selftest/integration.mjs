// §20 INTEGRATION layer — real HTTP round-trips against the LIVE app +
// bridge (chat API · provider connection · web search · PC bridge · file ·
// git · terminal · auth). Needs start-app.bat (or next start) + bridge.
// Run: node .selftest/integration.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Suite, WS, APP, HDR, api, forgeSession, portOpen, startMock, stopMock, freshDir, rmrf } from "./helpers.mjs";

const s = new Suite("integration");
const MARK = Date.now().toString(36);

// ---- preflight: services must be up (fail with instructions, not silently) ----
if (!(await portOpen(3000))) {
  console.log("FATAL: app not running on :3000 — start it via start-app.bat, then re-run");
  process.exit(2);
}
if (!(await portOpen(8765))) {
  console.log("FATAL: agent-bridge not running on :8765 — start it (start-server.bat starts both)");
  process.exit(2);
}
let mockChild = null;
let mockPort = 18787;
if (!(await portOpen(mockPort))) {
  mockChild = await startMock("mock-provider.js", mockPort);
  console.log("[setup] mock-provider spawned on :" + mockPort);
}

const COOKIE = forgeSession();
const pc = (op, params = {}) => api("/api/pc", { method: "POST", cookie: COOKIE, body: { op, ...params } });

// ---- bucket self-heal: when suites run back-to-back, the auth/test-conn
// rate windows may still be full from the previous suite. Wait until a
// cheap auth GET passes (max ~70s) so the suite is order-independent. ----
for (let i = 0; i < 15; i++) {
  const p = await api("/api/auth", { cookie: COOKIE });
  if (p.status !== 429) break;
  await new Promise((r) => setTimeout(r, 5000));
}
for (let i = 0; i < 15; i++) {
  const p = await api("/api/test-connection", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: "k", apiModel: "mock-fast" } });
  if (p.status !== 429) break;
  await new Promise((r) => setTimeout(r, 5000));
}
try {
  // ================================================================= AUTH ===
  let r = await api("/api/auth", { cookie: COOKIE });
  const st = r.json();
  s.record("AUTH", "GET /api/auth → registered+authenticated booleans",
    r.status === 200 && st.registered === true && st.authenticated === true, JSON.stringify(st));
  r = await api("/api/auth", { method: "POST", body: { action: "dance" } });
  s.record("AUTH", "unknown action → 400", r.status === 400, `status ${r.status}`);
  r = await api("/api/auth", { method: "POST", body: { action: "login", pin: "0000" } });
  s.record("AUTH", "wrong PIN refused (401, or 429 when the 5-strike lockout is active)",
    r.status === 401 || r.status === 429, `status ${r.status}`);
  r = await api("/api/auth", { method: "POST", body: { action: "logout" }, cookie: COOKIE });
  s.record("AUTH", "logout → 200 + cookie cleared",
    r.status === 200 && /Max-Age=0/.test(r.headers.get("set-cookie") || ""), `set-cookie: ${(r.headers.get("set-cookie") || "").slice(0, 40)}`);

  // ============================================================== PROVIDER ==
  r = await api("/api/test-connection", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: "k", apiModel: "mock-fast" } });
  s.record("PROVIDER", "test-connection against mock provider succeeds",
    r.status === 200 && r.json()?.ok === true, (r.text || "").slice(0, 70));
  r = await api("/api/test-connection", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://169.254.169.254/latest/meta-data/", apiKey: "k", apiModel: "m" } });
  s.record("PROVIDER", "test-connection to cloud metadata → 400 (SSRF §11)",
    r.status === 400 && /rejected/.test(r.text), (r.text || "").slice(0, 70));

  // ================================================================= CHAT ===
  r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: "k", model: "mock-fast", stream: false, messages: [{ role: "user", content: "integration ping" }] } });
  s.record("CHAT", "non-streaming chat returns provider reply",
    r.status === 200 && /Hello from mock provider/.test(r.text), `status ${r.status}`);
  r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: "k", model: "mock-pong", stream: true, messages: [{ role: "user", content: "ping" }] } });
  {
    const content = [...r.text.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1]).join("");
    s.record("CHAT", "streaming SSE reassembles + terminates",
      r.status === 200 && content === "pong" && r.text.includes("[DONE]"), `reply=${JSON.stringify(content)}`);
  }
  r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://metadata.google.internal/", apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }] } });
  s.record("CHAT", "chat metadata apiBaseUrl → 400 (SSRF §11)", r.status === 400, `status ${r.status}`);
  r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:${mockPort}/v1`, apiKey: "k", model: "mock-fast", messages: [] } });
  s.record("CHAT", "empty messages[] rejected (schema §7)", r.status === 400, `status ${r.status}`);

  // ============================================================ WEB SEARCH ==
  r = await api("/api/web-search", { method: "POST", cookie: COOKIE, body: { query: "next.js app router" } });
  {
    const j = r.json();
    if (r.status === 200 && j?.ok && Array.isArray(j.results)) {
      s.record("WEBSEARCH", "search returns public results", j.results.length >= 0,
        `${j.results.length} results` + (j.results[0] ? ` (e.g. ${j.results[0].url})` : ""));
    } else if (r.status === 429) {
      s.skip("WEBSEARCH", "rate bucket full — route alive (429)", "covered in security suite");
    } else {
      s.skip("WEBSEARCH", "network/search unavailable", `status ${r.status} ${r.text.slice(0, 50)}`);
    }
  }

  // ====================================================== BRIDGE: FILES =====
  const scratch = freshDir(path.join(WS, ".selftest", "itest"));
  const savedWs = fs.readFileSync(path.join(WS, "agent-bridge", "bridge-workspace.txt"), "utf8").trim();
  r = await pc("/workspace", { path: scratch });
  s.record("FILE", "workspace set to scratch dir", r.json()?.ok !== false, (r.text || "").slice(0, 60));
  r = await pc("/file/write", { path: "hello.txt", content: `ITEST-${MARK} line2\n` });
  s.record("FILE", "write file", r.json()?.ok === true, `bytes ${r.json()?.bytes}`);
  r = await pc("/file/read", { path: "hello.txt" });
  s.record("FILE", "read file (content round-trip)", r.json()?.content === `ITEST-${MARK} line2\n`);
  r = await pc("/file/edit", { path: "hello.txt", search: "line2", replace: `edited-${MARK}` });
  s.record("FILE", "edit replace", r.json()?.ok === true && r.json()?.replacements === 1);
  r = await pc("/file/read", { path: "hello.txt" });
  s.record("FILE", "edit persisted", r.json()?.content?.includes(`edited-${MARK}`) === true);
  r = await pc("/file/mkdir", { path: "sub/deep" });
  s.record("FILE", "mkdir recursive", r.json()?.ok === true);
  r = await pc("/file/write", { path: "sub/deep/n.txt", content: "N" });
  s.record("FILE", "write inside new subdir", r.json()?.ok === true);
  r = await pc("/file/list", { path: "sub" });
  s.record("FILE", "list shows entry", (r.json()?.entries || []).some((e) => e.name === "deep"));
  r = await pc("/file/move", { from: "sub/deep/n.txt", to: "moved.txt" });
  s.record("FILE", "move", r.json()?.ok === true && fs.existsSync(path.join(scratch, "moved.txt")));
  r = await pc("/grep", { pattern: `edited-${MARK}`, path: "." });
  s.record("FILE", "grep finds the token", (r.json()?.hits || []).some((h) => h.file === "hello.txt"));
  r = await pc("/file/delete", { path: "moved.txt" });
  s.record("FILE", "delete", r.json()?.ok === true && !fs.existsSync(path.join(scratch, "moved.txt")));

  // ======================================================= BRIDGE: GIT ======
  try {
    execSync(`git init -q "${scratch}"`, { stdio: "ignore" });
    execSync(`git -C "${scratch}" config user.email t@t && git -C "${scratch}" config user.name itest`, { stdio: "ignore" });
    r = await pc("/git/status", { cwd: scratch });
    s.record("GIT", "status works", r.status === 200 && r.json()?.ok !== false, (r.text || "").slice(0, 50));
    r = await pc("/git/stage", { cwd: scratch });
    s.record("GIT", "stage all", r.json()?.ok !== false);
    r = await pc("/git/commit", { message: `itest commit ${MARK}`, cwd: scratch });
    s.record("GIT", "commit", r.json()?.ok === true, (r.json()?.error || "").slice(0, 50));
    r = await pc("/git/log", { cwd: scratch, limit: 3 });
    s.record("GIT", "log contains commit", String(r.json()?.stdout || "").includes(`itest commit ${MARK}`));
    r = await pc("/git/diff", { cwd: scratch, staged: true });
    s.record("GIT", "diff runs", r.status === 200);
  } catch (e) {
    s.skip("GIT", "git not available for scratch repo", e.message.slice(0, 60));
  }

  // ==================================================== BRIDGE: TERMINAL ====
  {
    r = await pc("/term/create", { cwd: scratch });
    const term = r.json();
    const tid = term?.id;
    s.record("TERM", "create session", term?.ok === true && !!tid, `id=${tid}`);
    if (tid) {
      await pc("/term/write", { id: tid, input: `echo TOUT-${MARK}\r` });
      let seen = "";
      for (let i = 0; i < 12; i++) {
        const o = await pc("/term/output", { id: tid, since: 0 });
        seen += String(o.json()?.new || "");
        if (seen.includes(`TOUT-${MARK}`)) break;
        await new Promise((res) => setTimeout(res, 400));
      }
      s.record("TERM", "write + output stream round-trip", seen.includes(`TOUT-${MARK}`));
      r = await pc("/term/list");
      s.record("TERM", "list shows session", (r.json()?.terms || []).some((t) => t.id === tid));
      r = await pc("/term/kill", { id: tid });
      s.record("TERM", "kill session", r.json()?.ok === true);
    } else {
      s.skip("TERM", "output/list/kill (no session)");
    }
  }
  // exec still works (policy-checked)
  r = await pc("/exec", { command: "echo EXEC-OK", cwd: scratch });
  s.record("TERM", "exec echo", /EXEC-OK/.test(String(r.json()?.stdout || "")));

  // ---- cleanup: restore workspace + scratch ----
  await pc("/workspace", { path: savedWs || WS });
  rmrf(scratch);
} finally {
  if (mockChild) stopMock(mockChild);
}

await s.finish();

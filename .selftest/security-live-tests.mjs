// REAL-TIME security test suite — runs against the LIVE app + bridge.
// Covers layers 7-17 PLUS the server-side session auth, SSRF and schema caps.
// Safe: destructive ops are confined to .selftest/sec-demo; denylist tests are
// blocked by design. Session: the suite registers its own account if none
// exists, or (same trust domain) signs a cookie from the server secret file.
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

// self-locating: works from any drive/folder the workspace is moved to
const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// FUNC streaming test needs the mock provider — start one if absent so the
// suite is self-sufficient (previously an unstarted mock showed as a false
// 24/25 regression).
async function portOpen(p) {
  return new Promise((res) => {
    const s = net.connect(p, "127.0.0.1");
    s.setTimeout(600);
    s.on("connect", () => { s.destroy(); res(true); });
    s.on("error", () => res(false));
    s.on("timeout", () => { s.destroy(); res(false); });
  });
}
let mockChild = null;

const HDR = { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" };
let COOKIE = "";

const post = (p, body, extra = {}) =>
  fetch("http://localhost:3000" + p, {
    method: "POST",
    headers: { ...HDR, ...extra.headers, ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, text: await r.text() }));

const results = [];
const record = (layer, name, pass, detail) => {
  results.push({ layer, name, pass, detail });
  console.log(` ${pass ? "PASS" : "FAIL"}  [${layer}] ${name} — ${detail}`);
};

// ---------- setup: scratch git repo + session ----------
const demo = path.join(WS, ".selftest", "sec-demo");
fs.rmSync(demo, { recursive: true, force: true });
fs.mkdirSync(demo, { recursive: true });
fs.writeFileSync(demo + "\\app.js", 'console.log("hello from sec-demo");\n');
execSync(`git init -q "${demo}"`);
execSync(`git -C "${demo}" add .`);

const AUTH_DIR = path.join(WS, ".auth");
const authed = fs.existsSync(AUTH_DIR + "\\auth.json");

(async () => {
  // ---------- session bootstrap ----------
  if (!authed) {
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const r = await fetch("http://localhost:3000/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", pin, name: "Security Tests" }),
    });
    const setCookie = r.headers.get("set-cookie") || "";
    COOKIE = (setCookie.match(/chatbox_session=[^;]+/) || [])[0] || "";
    console.log(`[setup] registered fresh test account (PIN ${pin}) → cookie: ${COOKIE ? "ok" : "MISSING"}`);
  } else {
    // same trust domain: sign a session from the server secret (local file)
    const secret = fs.readFileSync(AUTH_DIR + "\\session-secret", "utf8").trim();
    let ver = 0;
    try { ver = Number(JSON.parse(fs.readFileSync(AUTH_DIR + "\\auth.json", "utf8")).tokenVersion) || 0; } catch {}
    const exp = Date.now() + 3600_000;
    const sig = crypto.createHmac("sha256", secret).update("chatbox-session|" + exp + "|" + ver).digest("hex");
    COOKIE = `chatbox_session=${exp}.${ver}.${sig}`;
    console.log("[setup] 3-part session cookie forged from server secret (version " + ver + ")");
  }

  // ---------- AUTH: unauthenticated request must fail ----------
  let r = await fetch("http://localhost:3000/api/pc", { method: "POST", headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" }, body: JSON.stringify({ op: "status" }) });
  record("AUTH", "API without session cookie → 401", r.status === 401, `status ${r.status}`);
  r = await fetch("http://localhost:3000/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" }, body: JSON.stringify({}) });
  record("AUTH", "chat without session → 401", r.status === 401, `status ${r.status}`);
  r = await fetch("http://localhost:3000/", { redirect: "manual" });
  record("AUTH", "unauthenticated page visit → redirect /login", r.status === 307 || r.status === 302, `status ${r.status} → ${r.headers.get("location") || "-"}`);
  if (!COOKIE) { console.log("FATAL: no session — cannot continue authenticated tests"); process.exit(1); }

  const pc = (op, params = {}) => post("/api/pc", { op, ...params });

  // point the bridge at the scratch repo
  await pc("/workspace", { path: demo });

  // ---------- L7: client header ----------
  r = await fetch("http://localhost:3000/api/pc", { method: "POST", headers: { "Content-Type": "application/json", Cookie: COOKIE }, body: JSON.stringify({ op: "status" }) });
  record("L7", "cross-site request WITHOUT client header", r.status === 403, `status ${r.status} (expect 403)`);
  r = await pc("status");
  record("L7", "legit request WITH client header", r.status === 200 && JSON.parse(r.text).ok, `status ${r.status}`);

  // ---------- L8: op whitelist ----------
  r = await post("/api/pc", { op: "/format-c-drive" });
  record("L8", "unknown/dangerous op rejected", r.status === 400, `status ${r.status} (expect 400)`);
  r = await pc("/file/list", { path: "" });
  record("L8", "whitelisted op forwarded", r.status === 200 && JSON.parse(r.text).ok, `status ${r.status}`);

  // ---------- L10: body size cap (before the L9 bucket fill) ----------
  r = await post("/api/web-search", JSON.stringify({ query: "x".repeat(20 * 1024) }), {});
  record("L10", "oversized body rejected", r.status === 413, `status ${r.status} (expect 413)`);

  // ---------- L11: command injection via commit message ----------
  const evil = 'test"; calc & echo "PWNED';
  await pc("/git/stage", { cwd: demo });
  r = await pc("/git/commit", { message: evil, cwd: demo });
  const commitOk = r.status === 200 && JSON.parse(r.text).ok;
  const logMsg = execSync(`git -C "${demo}" log -1 --format=%s`).toString().trim();
  const stored = logMsg === evil;
  const occurrences = (r.text.match(/PWNED/g) || []).length;
  record("L11", "commit message injection neutralized", commitOk && stored && occurrences === 1,
    `commit ok=${commitOk}, stored literally=${stored}, PWNED count=${occurrences}`);
  console.log(`      └ stored subject: ${JSON.stringify(logMsg)}`);

  // ---------- L12: explicit workspace clear ----------
  await pc("/workspace", { path: demo });
  r = await pc("/workspace");
  const stillDemo = JSON.parse(r.text).workspace === demo;
  record("L12", "empty POST does NOT wipe workspace", stillDemo, `workspace: ${JSON.parse(r.text).workspace}`);
  await pc("/workspace", { clear: true });
  await pc("/workspace", { path: WS });

  // ---------- L13: token isolation ----------
  r = await post("/api/pc", { op: "token" });
  record("L13", "no op can hand out the bridge token", r.status === 400, `op "token" → ${r.status}`);

  // ---------- L14: path confinement + guarded zone ----------
  r = await pc("/file/read", { path: path.join(WS, "agent-bridge", "bridge-token.txt") });
  record("L14", "bridge token file unreadable (guarded zone)", !JSON.parse(r.text).ok && /guarded|protected/i.test(r.text), (JSON.parse(r.text).error || "").slice(0, 60));
  r = await pc("/file/read", { path: "C:\\Windows\\win.ini" });
  record("L14", "outside-workspace read blocked", !JSON.parse(r.text).ok, (JSON.parse(r.text).error || "blocked").slice(0, 60));

  // ---------- L15: exec denylist ----------
  r = await pc("/exec", { command: 'type ".env"', cwd: demo });
  record("L15", ".env access denied by policy", !JSON.parse(r.text).ok && /policy/i.test(r.text), (JSON.parse(r.text).error || "").slice(0, 55));
  r = await pc("/exec", { command: "type C:\\Users\\Atik\\.ssh\\id_rsa", cwd: demo });
  record("L15", "SSH private key denied by policy", !JSON.parse(r.text).ok && /policy/i.test(r.text), (JSON.parse(r.text).error || "").slice(0, 55));

  // ---------- L16: secret redaction + audit ----------
  r = await pc("/exec", { command: "echo sk-FAKE1234567890abcd", cwd: demo });
  const out = JSON.parse(r.text).stdout || "";
  record("L16", "API-key pattern redacted from output", /REDACTED/.test(out) && !/FAKE1234567890abcd/.test(out), `stdout: ${out.trim().slice(0, 40)}`);
  const audit = fs.readFileSync(path.join(WS, "agent-bridge", "audit.log"), "utf8").trim().split("\n");
  record("L16", "action audited", audit.some((l) => l.includes("EXEC") && l.includes("echo sk-FAKE")), "audit.log has the EXEC entry");

  // ---------- L17: monaco local loader ----------
  const loader = await fetch("http://localhost:3000/monaco-vscode/loader.js");
  const page = await fetch("http://localhost:3000/", { headers: { Cookie: COOKIE } });
  const pageHtml = await page.text();
  record("L17", "monaco served locally, no CDN", loader.status === 200 && !/jsdelivr|unpkg|cdnjs/.test(pageHtml), `loader.js ${loader.status}`);

  // ---------- SSRF guards ----------
  r = await pc("/file/download", { url: "http://127.0.0.1:8765/status", path: demo + "\\dl.txt" });
  record("SSRF", "bridge download to loopback blocked", r.status === 200 && !JSON.parse(r.text).ok && /private|loopback/i.test(r.text), (JSON.parse(r.text).error || "").slice(0, 55));
  r = await post("/api/web-search", { query: "test" }); // normal flow still works (rate bucket may 429 — acceptable signal)
  record("SSRF", "web-search route alive", r.status === 200 || r.status === 429, `status ${r.status}`);

  // ---------- schema caps ----------
  r = await post("/api/chat", { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", model: "mock-fast", temperature: 5, messages: [{ role: "user", content: "hi" }] });
  record("SCHEMA", "temperature 5 rejected", r.status === 400, `status ${r.status}`);
  r = await post("/api/chat", { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", model: "mock-fast", messages: Array.from({ length: 101 }, () => ({ role: "user", content: "x" })) });
  record("SCHEMA", "101 messages rejected", r.status === 400, `status ${r.status}`);
  r = await post("/api/chat", { apiBaseUrl: "file:///etc/passwd", apiKey: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
  record("SCHEMA", "non-http apiBaseUrl rejected", r.status === 400, `status ${r.status}`);

  // ---------- L9: rate limit LAST (fills the web-search bucket) ----------
  let hit429 = 0;
  for (let i = 0; i < 14; i++) {
    const rr = await post("/api/web-search", { query: "" });
    if (rr.status === 429) { hit429 = i + 1; break; }
  }
  record("L9", "rate limiter kicks in within 14 calls (12/min cap)", hit429 > 0 && hit429 <= 14, `first 429 at request #${hit429 || "none"} (≤14 = limiter active; exact slot shifts with earlier calls)`);

  // ---------- happy path: legit chat still streams ----------
  if (!(await portOpen(18787))) {
    mockChild = spawn(process.execPath, [path.join(WS, ".selftest", "mock-provider.js")], { cwd: path.join(WS, ".selftest"), stdio: "ignore", windowsHide: true });
    await new Promise((r) => setTimeout(r, 800));
  }
  r = await post("/api/chat", { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", model: "mock-fast", stream: true, messages: [{ role: "user", content: "hi" }] });
  const txt = await r.text;
  const content = [...txt.matchAll(/"content":"([^"]*)"/g)].map((m) => m[1]).join("");
  record("FUNC", "legit streaming chat still works", r.status === 200 && content === "Hello from mock provider", `reply=${JSON.stringify(content)}`);
  if (mockChild) { try { mockChild.kill(); } catch {} }

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n=== ${passed}/${results.length} REAL-TIME SECURITY TESTS PASSED ===`);
  process.exit(passed === results.length ? 0 : 1);
})();

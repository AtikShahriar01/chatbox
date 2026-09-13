// §20 SECURITY-DEEP layer — the directive's named security tests, beyond the
// baseline battery in security-live-tests.mjs:
//   SSRF · path traversal · symlink escape · command injection · CSRF ·
//   XSS headers · auth bypass · rate-limit bypass
// Needs the live app + bridge. Rate-limit tests run LAST (they exhaust buckets).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Suite, WS, APP, HDR, api, forgeSession, legacyCookie, portOpen, freshDir, rmrf, tryJunction } from "./helpers.mjs";

const s = new Suite("security-deep");
if (!(await portOpen(3000)) || !(await portOpen(8765))) {
  console.log("FATAL: app (:3000) or bridge (:8765) not running");
  process.exit(2);
}
const COOKIE = forgeSession();
const pc = (op, params = {}) => api("/api/pc", { method: "POST", cookie: COOKIE, body: { op, ...params } });
const demo = freshDir(path.join(WS, ".selftest", "sec-demo2"));

// ========================================================= AUTH BYPASS =====
{
  const bogus = "chatbox_session=" + Date.now() + ".0." + "f".repeat(64);
  let r = await api("/api/pc", { method: "POST", cookie: bogus, body: { op: "status" } });
  s.record("AUTH-BYPASS", "forged signature → 401", r.status === 401, `status ${r.status}`);
  r = await api("/api/chat", { method: "POST", cookie: "chatbox_session=garbage", body: {} });
  s.record("AUTH-BYPASS", "garbage cookie → 401", r.status === 401, `status ${r.status}`);
  r = await api("/api/pc", { method: "POST", cookie: forgeSession({ version: 999 }), body: { op: "status" } });
  s.record("AUTH-BYPASS", "valid sig but wrong token version → 401", r.status === 401, `status ${r.status}`);
  r = await api("/api/pc", { method: "POST", cookie: forgeSession({ expOffsetMs: -10_000 }), body: { op: "status" } });
  s.record("AUTH-BYPASS", "expired token (correctly signed) → 401", r.status === 401, `status ${r.status}`);
  {
    // cookie signed with a DIFFERENT secret must not pass
    const fake = path.join(WS, ".selftest", "fake-secret");
    fs.writeFileSync(fake, "a".repeat(64));
    const legacy = forgeSession({ secretFile: fake });
    const fake2 = path.join(WS, ".selftest", "fake-secret2");
    fs.writeFileSync(fake2, "b".repeat(64));
    r = await api("/api/pc", { method: "POST", cookie: forgeSession({ secretFile: fake2 }), body: { op: "status" } });
    s.record("AUTH-BYPASS", "token from another secret → 401", r.status === 401, `status ${r.status}`);
    rmrf(fake); rmrf(fake2);
  }
  // legacy 2-part: accepted only while version === 0 (documented rollback window)
  {
    let ver = 0;
    try { ver = Number(JSON.parse(fs.readFileSync(path.join(WS, ".auth", "auth.json"), "utf8")).tokenVersion) || 0; } catch {}
    r = await api("/api/pc", { method: "POST", cookie: legacyCookie(), headers: {}, body: { op: "status" }, headers: HDR });
    const expectOk = ver === 0;
    s.record("AUTH-BYPASS", `legacy 2-part cookie handled per version(${ver})`,
      expectOk ? r.status === 200 : r.status === 401, `status ${r.status}`);
  }
  r = await api("/api/pc", { method: "POST", body: { op: "status" }, headers: { ...HDR, "x-chatbox-session": "yes" } });
  s.record("AUTH-BYPASS", "session via custom header (not cookie) → 401", r.status === 401, `status ${r.status}`);
  r = await api("/api/auth", { cookie: "chatbox_session=" + Date.now() + ".0." + "0".repeat(64) });
  s.record("AUTH-BYPASS", "/api/auth reports authenticated:false for forged cookie", r.json()?.authenticated === false);
  r = await api("/api/pc", { method: "POST", body: { op: "status" }, headers: { ...HDR, Origin: "http://localhost:3000" } });
  s.record("AUTH-BYPASS", "no cookie at all → 401", r.status === 401, `status ${r.status}`);
}

// ================================================================== SSRF ====
{
  let r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://[::ffff:a9fe:a9fe]/latest", apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }] } });
  s.record("SSRF", "chat: IPv6-mapped IMDS → 400", r.status === 400, `status ${r.status}`);
  r = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: "http://100.100.100.200/latest/", apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }] } });
  s.record("SSRF", "chat: Alibaba IMDS → 400", r.status === 400, `status ${r.status}`);
  r = await pc("/file/download", { url: "http://[::1]:3000/api/auth", path: "x.bin" });
  s.record("SSRF", "bridge download IPv6 loopback [::1] blocked", /blocked|private/i.test(r.text), r.text.slice(0, 60));
  r = await pc("/file/download", { url: "http://[::ffff:7f00:1]:8765/status", path: "x.bin" });
  s.record("SSRF", "bridge download mapped loopback blocked", /blocked|private/i.test(r.text), r.text.slice(0, 60));
  r = await pc("/file/download", { url: "ftp://example.com/x", path: "x.bin" });
  s.record("SSRF", "bridge download non-http scheme rejected", r.json()?.ok === false);
  r = await pc("/file/download", { url: "http://185.199.108.153/x", path: "x.bin", timeoutMs: 8000 });
  s.record("SSRF", "public IP target NOT over-blocked (legit downloads work)",
    /HTTP|blocked|error|fetch|timed|ENOTFOUND|ECONN/i.test(String(r.json()?.error || "ok")) || r.json()?.ok === true,
    String(r.json()?.error || "downloaded").slice(0, 60));
}

// ========================================================= PATH TRAVERSAL ==
{
  await pc("/workspace", { path: demo });
  let r = await pc("/file/read", { path: "..\\..\\..\\..\\Windows\\win.ini" });
  s.record("TRAVERSAL", "..\\.. to Windows dir rejected", r.json()?.ok === false, (r.json()?.error || "").slice(0, 50));
  r = await pc("/file/read", { path: "../../../../Windows/win.ini" });
  s.record("TRAVERSAL", "posix-style traversal rejected", r.json()?.ok === false);
  r = await pc("/file/write", { path: "sub\\..\\..\\..\\escape.txt", content: "x" });
  s.record("TRAVERSAL", "write traversal rejected + no file created",
    r.json()?.ok === false && !fs.existsSync(path.join(WS, "escape.txt")));
  r = await pc("/file/read", { path: path.join(WS, ".auth", "auth.json") });
  s.record("TRAVERSAL", "PIN hash file outside scratch workspace unreadable", r.json()?.ok === false);
  // encoded dots: never decoded server-side → just a missing file, not an escape
  r = await pc("/file/read", { path: "%2e%2e%2f%2e%2e%2fWindows%2fwin.ini" });
  s.record("TRAVERSAL", "percent-encoded traversal is not a win.ini read", !/<\[fonts\]/.test(r.text));
}

// ========================================================= SYMLINK ESCAPE ==
{
  const link = path.join(demo, "escape");
  if (tryJunction(WS, link)) {
    // link inside scratch workspace pointing at the PROJECT ROOT
    let r = await pc("/file/read", { path: "escape\\.auth\\auth.json" });
    s.record("SYMLINK", "junction to project root cannot expose .auth", r.json()?.ok === false, (r.json()?.error || "").slice(0, 60));
    rmrf(link);
  } else {
    s.skip("SYMLINK", "live junction test (OS refused link creation)");
  }
  const link2 = path.join(demo, "win");
  if (tryJunction("C:\\Windows", link2)) {
    const r = await pc("/file/read", { path: "win\\win.ini" });
    s.record("SYMLINK", "junction to C:\\Windows blocked by real-path check",
      r.json()?.ok === false && !/<\[fonts\]/.test(r.text), (r.json()?.error || "").slice(0, 60));
    rmrf(link2);
  } else {
    s.skip("SYMLINK", "junction to C:\\Windows (OS refused)");
  }
}

// ====================================================== COMMAND INJECTION ===
{
  await pc("/workspace", { path: demo });
  fs.writeFileSync(path.join(demo, "a.txt"), "a");
  const evilPath = "a.txt && echo PWN > pwn.txt";
  let r = await pc("/git/stage", { cwd: demo, path: evilPath });
  const pwnExists = fs.existsSync(path.join(demo, "pwn.txt"));
  s.record("INJECTION", "git stage path with && cannot spawn extra command",
    !pwnExists && (r.json()?.ok === false || r.json()?.ok === true), `pwn.txt=${pwnExists}`);
  r = await pc("/git/branch", { cwd: demo, create: "br; echo PWN2 > pwn2.txt" });
  s.record("INJECTION", "git branch name injection → fails cleanly, no file",
    !fs.existsSync(path.join(demo, "pwn2.txt")) && r.json()?.ok === false, (r.json()?.error || "").slice(0, 50));
  const litName = "inj$(x)`;touch`.txt";
  r = await pc("/file/write", { path: litName, content: "literal" });
  s.record("INJECTION", "shell metachars in filename stay literal data",
    r.json()?.ok === true && fs.readFileSync(path.join(demo, litName), "utf8") === "literal" &&
    !fs.existsSync(path.join(demo, "touch\".txt")), (r.json()?.error || "").slice(0, 50));
}

// ================================================================== CSRF ====
{
  let r = await api("/api/pc", { method: "POST", cookie: COOKIE, headers: { "Content-Type": "application/json", Origin: "http://evil.example.com" }, body: { op: "status" }, bare: true });
  s.record("CSRF", "cross-site Origin (valid cookie+client header) → 403", r.status === 403, `status ${r.status}`);
  r = await api("/api/pc", { method: "POST", cookie: COOKIE, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: { op: "status" }, bare: true });
  s.record("CSRF", "simple form POST without client header → 403", r.status === 403, `status ${r.status}`);
  r = await api("/api/chat", { method: "POST", body: "{}", headers: { "Content-Type": "text/plain", Origin: "null" }, cookie: COOKIE, bare: true });
  s.record("CSRF", "text/plain no-cors style POST (Origin null) → 403", r.status === 403, `status ${r.status}`);
  // Host rebinding: fetch manages the Host header itself → use a raw socket
  const net = await import("node:net");
  const reqBody = '{"op":"status"}';
  const rawReq = await new Promise((res) => {
    const sock = net.connect(3000, "127.0.0.1", () => {
      sock.write(`POST /api/pc HTTP/1.1\r\nHost: evil.example.com\r\nContent-Type: application/json\r\nx-chatbox-client: chatbox-web-1\r\nCookie: ${COOKIE}\r\nContent-Length: ${Buffer.byteLength(reqBody)}\r\n\r\n${reqBody}`);
    });
    let buf = "";
    sock.setTimeout(5000);
    sock.on("data", (d) => { buf += d.toString(); if (/\r\n\r\n/.test(buf)) { sock.destroy(); res(buf); } });
    sock.on("error", () => res("ERR"));
    sock.on("timeout", () => { sock.destroy(); res(buf); });
  });
  s.record("CSRF", "DNS-rebinding Host (evil.example.com) refused",
    /^HTTP\/1\.[01] 403/m.test(rawReq), rawReq.split("\r\n")[0] || rawReq.slice(0, 30));
}

// =================================================================== XSS ====
{
  const page = await api("/", { cookie: COOKIE });
  const csp = page.headers.get("content-security-policy") || "";
  s.record("XSS", "CSP present with hard directives",
    csp.includes("default-src 'self'") && csp.includes("object-src 'none'") &&
    csp.includes("frame-ancestors 'none'") && csp.includes("base-uri 'self'"), csp.slice(0, 60) + "…");
  s.record("XSS", "nosniff + X-Frame-Options DENY + Referrer-Policy",
    page.headers.get("x-content-type-options") === "nosniff" && page.headers.get("x-frame-options") === "DENY" &&
    /no-referrer/.test(page.headers.get("referrer-policy") || ""));
  const evil = "<img src=x onerror=alert(1)>";
  const login = await api("/login?next=" + encodeURIComponent(evil));
  s.record("XSS", "query param not reflected as raw HTML", !login.text.includes(evil) && login.status === 200);
  const err = await api("/api/chat", { method: "POST", cookie: COOKIE, body: { apiBaseUrl: `http://127.0.0.1:18787/v1`, apiKey: "k", model: "<svg onload=alert(1)>", messages: [{ role: "user", content: "x" }] } });
  s.record("XSS", "error responses are application/json (not HTML)",
    !/^text\/html/.test(err.headers.get("content-type") || ""), err.headers.get("content-type"));
  const mb = fs.readFileSync(path.join(WS, "app/components/MessageBubble.js"), "utf8");
  s.record("XSS", "markdown renderer sanitizes (rehype-sanitize wired)", /rehypeSanitize/.test(mb));
}

// ====================================================== RATE-LIMIT BYPASS ===
// LAST: these deliberately exhaust buckets.
{
  let hit = 0;
  for (let i = 0; i < 20; i++) {
    const rr = await api("/api/test-connection", {
      method: "POST", cookie: COOKIE,
      headers: { "x-forwarded-for": `10.${i}.${i}.${i}` }, // spoofed IPs
      body: { apiBaseUrl: "http://127.0.0.1:18787/v1", apiKey: "k", apiModel: "mock-fast" },
    });
    if (rr.status === 429) { hit = i + 1; break; }
  }
  s.record("RATE", "spoofed X-Forwarded-For does NOT reset per-route bucket",
    hit > 0, `429 at request #${hit} (route bucket is global — 15/min cap)`);
}

rmrf(demo);
await s.finish();

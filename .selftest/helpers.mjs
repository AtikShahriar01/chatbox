// Shared helpers for the §20 layered test suite (unit / integration /
// security-deep / e2e). Self-locating: works from any drive/folder.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP = "http://localhost:3000";
export const HDR = { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" };

// ---------------------------------------------------------------- suite ----
export class Suite {
  constructor(name) { this.name = name; this.items = []; }
  record(group, name, pass, detail = "") {
    this.items.push({ group, name, pass, detail, skipped: false });
    console.log(` ${pass ? "PASS" : "FAIL"}  [${group}] ${name}${detail ? " — " + detail : ""}`);
    return pass;
  }
  skip(group, name, detail = "") {
    this.items.push({ group, name, pass: true, detail, skipped: true });
    console.log(` SKIP  [${group}] ${name}${detail ? " — " + detail : ""}`);
  }
  async finish(exitOnFail = true) {
    const passed = this.items.filter((x) => x.pass).length;
    const skipped = this.items.filter((x) => x.skipped).length;
    const failed = this.items.length - passed;
    console.log(`\n=== ${this.name}: ${passed}/${this.items.length} passed` +
      (skipped ? ` (${skipped} skipped)` : "") +
      (failed ? ` — ${failed} FAILED ===` : " PASSED ==="));
    if (exitOnFail) process.exit(failed ? 1 : 0);
    return { total: this.items.length, passed, failed, skipped };
  }
}

// ------------------------------------------------------------- session -----
// Same-trust-domain cookie forging (local file access is the trust anchor —
// the suite is a local dev tool, exactly like security-live-tests.mjs).
// Supports both token shapes: <exp>.<ver>.<hmac> (§16) and legacy <exp>.<hmac>.
export function forgeSession({ version = "current", expOffsetMs = 3600_000, secretFile = null } = {}) {
  const authDir = path.join(WS, ".auth");
  const secret = (secretFile ? fs.readFileSync(secretFile, "utf8") : fs.readFileSync(path.join(authDir, "session-secret"), "utf8")).trim();
  let ver = 0;
  try { ver = Number(JSON.parse(fs.readFileSync(path.join(authDir, "auth.json"), "utf8")).tokenVersion) || 0; } catch {}
  const v = version === "current" ? ver : Number(version);
  const exp = Date.now() + expOffsetMs;
  const sig = crypto.createHmac("sha256", secret).update("chatbox-session|" + exp + "|" + v).digest("hex");
  return `chatbox_session=${exp}.${v}.${sig}`;
}
export function legacyCookie(secretFile = null) {
  const authDir = path.join(WS, ".auth");
  const secret = (secretFile ? fs.readFileSync(secretFile, "utf8") : fs.readFileSync(path.join(authDir, "session-secret"), "utf8")).trim();
  const exp = Date.now() + 3600_000;
  const sig = crypto.createHmac("sha256", secret).update("chatbox-session|" + exp).digest("hex");
  return `chatbox_session=${exp}.${sig}`;
}

// ---------------------------------------------------------------- http -----
export async function api(pathOrUrl, { method = "GET", cookie = "", body, headers = {}, raw = false, redirect = "manual", bare = false } = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : APP + pathOrUrl;
  const opts = { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }, redirect };
  if (body !== undefined) {
    // bare:true sends ONLY the headers given (lets a test OMIT x-chatbox-client)
    opts.headers = { ...(bare ? {} : HDR), ...headers, ...(cookie ? { Cookie: cookie } : {}) };
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  return { status: r.status, headers: r.headers, text, json: () => { try { return JSON.parse(text); } catch { return null; } } };
}

// ---------------------------------------------------------------- ports ----
export function portOpen(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const s = net.connect(port, host);
    s.setTimeout(800);
    s.on("connect", () => { s.destroy(); res(true); });
    s.on("error", () => res(false));
    s.on("timeout", () => { s.destroy(); res(false); });
  });
}

// spawn a .selftest mock server child; resolves true once its port is up
export async function startMock(script, port, { waitMs = 4000 } = {}) {
  const child = spawn(process.execPath, [path.join(WS, ".selftest", script)], {
    cwd: path.join(WS, ".selftest"), stdio: "ignore", windowsHide: true,
  });
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    if (await portOpen(port)) return child;
    await new Promise((r) => setTimeout(r, 200));
  }
  try { child.kill(); } catch {}
  throw new Error(`${script} did not come up on :${port}`);
}
export function stopMock(child) { try { child.kill(); } catch {} }

// -------------------------------------------------------------- files ------
export function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
export function freshDir(p) { rmrf(p); fs.mkdirSync(p, { recursive: true }); return p; }

// Try to create a directory symlink/junction (junctions work on Windows
// without admin). Returns true on success, false when the OS refused.
export function tryJunction(target, linkPath) {
  try {
    rmrf(linkPath);
    fs.symlinkSync(target, linkPath, "junction");
    return true;
  } catch {
    try { rmrf(linkPath); fs.symlinkSync(target, linkPath, "dir"); return true; } catch { return false; }
  }
}

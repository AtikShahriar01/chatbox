// Server-side session authentication (security directive §4).
// The PIN is verified SERVER-side; the browser only ever holds an HMAC-signed
// session cookie (HttpOnly, SameSite=Strict). Client-side checks in lib/auth.js
// are UI convenience only — the API layer enforces the real gate via guard().

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "..", ".auth");
const SECRET_FILE = path.join(AUTH_DIR, "session-secret");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");

export const SESSION_COOKIE = "chatbox_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function getSecret() {
  ensureAuthDir();
  try {
    const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s.length >= 64) return s;
    throw new Error("weak secret");
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_FILE, s, { encoding: "utf8" });
    return s;
  }
}

export function getAuthRecord() {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    if (raw && raw.salt && raw.pinHash) return raw;
    return null;
  } catch {
    return null;
  }
}

export function saveAuthRecord(pin, displayName = "Local User") {
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "PIN must be 4-8 digits" };
  ensureAuthDir();
  const salt = crypto.randomBytes(16).toString("hex");
  const pinHash = crypto.createHash("sha256").update(salt + ":" + pin).digest("hex");
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    salt, pinHash, displayName: String(displayName || "Local User").slice(0, 40),
    createdAt: new Date().toISOString(),
  }, null, 2));
  return { ok: true };
}

export function verifyPin(pin) {
  const rec = getAuthRecord();
  if (!rec) return { ok: false, error: "not registered" };
  if (!/^\d{4,8}$/.test(pin || "")) return { ok: false, error: "bad pin" };
  const hash = crypto.createHash("sha256").update(rec.salt + ":" + pin).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(rec.pinHash));
  return ok ? { ok: true } : { ok: false, error: "wrong pin" };
}

// Session token: "<expiry>.<hmac>" — the HMAC binds the expiry to the server
// secret, so a forged or expired cookie is useless (§4: session hijacking,
// token theft).
export function createSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = crypto.createHmac("sha256", getSecret()).update("chatbox-session|" + exp).digest("hex");
  return { token: `${exp}.${sig}`, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) };
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac("sha256", getSecret()).update("chatbox-session|" + exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionCookieHeader(token, maxAgeSec) {
  // Secure flag is intentionally omitted: the app is served over http on
  // 127.0.0.1 only (localhost binding + Host allowlist). HttpOnly + SameSite
  // = Strict still block JS theft and cross-site attachment.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sessionFromRequest(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export function isAuthed(req) {
  return verifySessionToken(sessionFromRequest(req));
}

// Route-handler gate: returns a 401 Response when there is no valid session,
// or null when the request may proceed. Used by every /api/* route
// (fail-closed — security directive §30).
export function requireSession(req) {
  if (!isAuthed(req)) {
    return new Response(JSON.stringify({ ok: false, error: "authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

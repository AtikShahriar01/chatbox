// Server-side session authentication (security directive §4).
// The PIN is verified SERVER-side; the browser only ever holds an HMAC-signed
// session cookie (HttpOnly, SameSite=Strict). There is no client-side auth
// shim — the API layer enforces the real gate via guard() + requireSession().

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

const SCRYPT = { N: 16384, r: 8, p: 1 };
function scryptPin(pin, salt, len) {
  return crypto.scryptSync(pin, salt, len, SCRYPT);
}
function legacySha(pin, salt) {
  return crypto.createHash("sha256").update(salt + ":" + pin).digest();
}

export function saveAuthRecord(pin, displayName = "Local User") {
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "PIN must be 4-8 digits" };
  ensureAuthDir();
  const salt = crypto.randomBytes(16).toString("hex");
  const pinHash = scryptPin(pin, salt, 32).toString("hex");
  const prev = getAuthRecord();
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    salt, pinHash, algo: "scrypt", displayName: String(displayName || "Local User").slice(0, 40),
    tokenVersion: Number(prev?.tokenVersion) || 0, createdAt: prev?.createdAt || new Date().toISOString(),
  }, null, 2));
  return { ok: true };
}

export function verifyPin(pin) {
  const rec = getAuthRecord();
  if (!rec) return { ok: false, error: "not registered" };
  if (!/^\d{4,8}$/.test(pin || "")) return { ok: false, error: "bad pin" };
  const expected = Buffer.from(rec.pinHash, "hex");
  const candidate = rec.algo === "scrypt"
    ? scryptPin(pin, rec.salt, expected.length)
    : legacySha(pin, rec.salt);
  const ok = candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  if (ok && rec.algo !== "scrypt") { try { saveAuthRecord(pin, rec.displayName); } catch {} }
  return ok ? { ok: true } : { ok: false, error: "wrong pin" };
}

// Session token: "<expiry>.<version>.<hmac>". The HMAC binds expiry AND the
// token version to the server secret → a forged/expired cookie is useless, and
// bumping the version (logout-all / recovery) revokes every outstanding cookie
// without a per-token store. Legacy 2-part cookies pass only while version === 0.
function currentVersion() {
  return Number(getAuthRecord()?.tokenVersion) || 0;
}
function signToken(exp, ver) {
  return crypto.createHmac("sha256", getSecret()).update("chatbox-session|" + exp + "|" + ver).digest("hex");
}
export function createSessionToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const ver = currentVersion();
  return { token: `${exp}.${ver}.${signToken(exp, ver)}`, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) };
}
export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  if (parts.length === 3) {
    if (Number(parts[1]) !== currentVersion()) return false;
    const a = Buffer.from(parts[2]); const b = Buffer.from(signToken(exp, Number(parts[1])));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (parts.length === 2) {
    if (currentVersion() !== 0) return false; // anything revoked ⇒ legacy dead
    const a = Buffer.from(parts[1]); const b = Buffer.from(crypto.createHmac("sha256", getSecret()).update("chatbox-session|" + exp).digest("hex"));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}
// §16 logout-all / recovery: bump version (invalidates all cookies); optionally
// set a new PIN in the same atomic write.
export function bumpTokenVersion(newPin) {
  const rec = getAuthRecord();
  if (!rec) return { ok: false, error: "not registered" };
  if (newPin && !/^\d{4,8}$/.test(newPin)) return { ok: false, error: "PIN must be 4-8 digits" };
  const salt = newPin ? crypto.randomBytes(16).toString("hex") : rec.salt;
  const pinHash = newPin ? scryptPin(newPin, salt, 32).toString("hex") : rec.pinHash;
  const nextVer = currentVersion() + 1;
  fs.writeFileSync(AUTH_FILE, JSON.stringify({
    salt, pinHash, algo: "scrypt", displayName: rec.displayName || "Local User",
    tokenVersion: nextVer, createdAt: rec.createdAt, updatedAt: new Date().toISOString(),
  }, null, 2));
  return { ok: true, tokenVersion: nextVer };
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

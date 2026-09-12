"use client";

// Auth adapter (spec-5 §AUTH UX) — local-first PIN auth.
// Single-user local app: the "account" is this PC. PIN hash (SHA-256,
// salted) lives in localStorage; first run sets the PIN (onboarding),
// later runs verify it. Clean interface so a real backend can replace
// it without touching the UI.

const KEY = "chatbox-auth";

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getAuth() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

export async function isRegistered() {
  return !!(await getAuth())?.pinHash;
}

export async function register(pin, displayName = "Local User") {
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, error: "PIN must be 4-8 digits" };
  const salt = Math.random().toString(36).slice(2, 10);
  const pinHash = await sha(salt + ":" + pin);
  const auth = { displayName, salt, pinHash, createdAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(auth));
  sessionStorage.setItem(KEY + "-session", String(Date.now()));
  return { ok: true };
}

export async function login(pin) {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "no account — register first" };
  const hash = await sha(auth.salt + ":" + pin);
  if (hash !== auth.pinHash) return { ok: false, error: "ভুল PIN — আবার চেষ্টা করুন" };
  sessionStorage.setItem(KEY + "-session", String(Date.now()));
  return { ok: true };
}

export async function logout() {
  sessionStorage.removeItem(KEY + "-session");
}

export async function isSessionValid() {
  const t = Number(sessionStorage.getItem(KEY + "-session") || 0);
  if (!t) return false;
  const MAX_AGE = 24 * 3600 * 1000; // 24h sessions
  return Date.now() - t < MAX_AGE;
}

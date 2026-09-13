// Server-side authentication endpoint (security directive §4).
//   GET  /api/auth                 → { registered, authenticated }
//   POST {action:"register",pin}   → first-run account creation + session
//   POST {action:"login",pin}      → verify PIN + session
//   POST {action:"logout"}         → clear session
// Brute-force protection: 5 failed PIN attempts → 5 minute lockout.

import {
  getAuthRecord, saveAuthRecord, verifyPin,
  createSessionToken, sessionCookieHeader, clearCookieHeader,
  sessionFromRequest, verifySessionToken, isAuthed, bumpTokenVersion,
} from "../../../lib/session";
import { guard } from "../../../lib/guard";

export const runtime = "nodejs";

// failed-login tracker (single-user local app → one global counter is right)
const attempts = { fails: 0, lockUntil: 0 };

export async function GET(req) {
  const blocked = guard(req, { rateKey: "auth-get", rateMax: 60, maxBody: 1024 });
  if (blocked) return blocked;
  const token = sessionFromRequest(req);
  return Response.json({
    registered: !!getAuthRecord(),
    authenticated: !!(token && verifySessionToken(token)),
  });
}

export async function POST(req) {
  const blocked = guard(req, { rateKey: "auth-post", rateMax: 30, maxBody: 4 * 1024 });
  if (blocked) return blocked;

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const action = String(body?.action || "");

  if (action === "logout") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": clearCookieHeader() },
    });
  }

  // brute-force lockout (§17)
  if (Date.now() < attempts.lockUntil) {
    const secs = Math.ceil((attempts.lockUntil - Date.now()) / 1000);
    return Response.json({ ok: false, error: `অনেকবার ভুল PIN — ${secs}s পরে আবার চেষ্টা করুন` }, { status: 429 });
  }

  if (action === "register") {
    if (getAuthRecord()) {
      return Response.json({ ok: false, error: "already registered — sign in instead" }, { status: 409 });
    }
    const res = saveAuthRecord(String(body?.pin || ""), body?.name);
    if (!res.ok) return Response.json(res, { status: 400 });
    attempts.fails = 0;
    const { token, maxAgeSec } = createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(token, maxAgeSec) },
    });
  }

  if (action === "login") {
    const res = verifyPin(String(body?.pin || ""));
    if (!res.ok) {
      attempts.fails += 1;
      if (attempts.fails >= 5) {
        attempts.lockUntil = Date.now() + 5 * 60 * 1000;
        attempts.fails = 0;
        return Response.json({ ok: false, error: "৫ বার ভুল PIN — ৫ মিনিটের জন্য লক" }, { status: 429 });
      }
      return Response.json(res, { status: 401 });
    }
    attempts.fails = 0;
    const { token, maxAgeSec } = createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(token, maxAgeSec) },
    });
  }

  if (action === "logout-all") {
    if (!isAuthed(req)) return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
    const r = bumpTokenVersion(); // rotates version → every other cookie is now invalid
    return new Response(JSON.stringify(r), {
      status: r.ok ? 200 : 400,
      headers: { "Content-Type": "application/json", "Set-Cookie": clearCookieHeader() },
    });
  }

  if (action === "change-pin") {
    // §16 recovery / rotation: must be signed in AND prove the current PIN;
    // bumps the token version so changing the PIN also revokes all sessions.
    if (!isAuthed(req)) return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
    const oldOk = verifyPin(String(body?.oldPin || ""));
    if (!oldOk.ok) { attempts.fails += 1; return Response.json({ ok: false, error: "current PIN incorrect" }, { status: 401 }); }
    attempts.fails = 0;
    const newPin = String(body?.newPin || "");
    if (!/^\d{4,8}$/.test(newPin)) return Response.json({ ok: false, error: "New PIN must be 4-8 digits" }, { status: 400 });
    const r = bumpTokenVersion(newPin);
    return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Content-Type": "application/json" } });
  }

  return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
}

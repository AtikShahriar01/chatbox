// Proxy between the Chatbox app and the local PC bridge (agent-bridge/server.js).
// The bridge runs on 127.0.0.1:8765 with a shared token file.
//
// SECURITY: this is the most sensitive endpoint in the app — it can run
// commands on this PC. Hardened with:
//   - client header requirement (cross-site pages cannot forge it)
//   - same-origin + host + rate-limit + body-cap via guard()
//   - strict op whitelist — only known bridge routes are forwarded

import { readFile } from "node:fs/promises";
import path from "node:path";
import { guard, ALLOWED_PC_OPS } from "../../../lib/guard";
import { requireSession } from "../../../lib/session";

export const runtime = "nodejs";

const BRIDGE = "http://127.0.0.1:8765";
const TOKEN_FILE = path.join(process.cwd(), "..", "agent-bridge", "bridge-token.txt");

async function bridgeToken() {
  try {
    return (await readFile(TOKEN_FILE, "utf8")).trim();
  } catch {
    return null;
  }
}

export async function POST(req) {
  const blocked = guard(req, {
    rateKey: "pc",
    rateMax: 240,
    maxBody: 6 * 1024 * 1024,
    requireClientHeader: true,
  });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { op, ...params } = body || {};
  if (!op) return Response.json({ ok: false, error: "Missing op" }, { status: 400 });

  // Op whitelist: reject anything that is not a known bridge route so a
  // manipulated request can never invent a new target.
  const route = String(op).startsWith("/") ? String(op) : `/${String(op)}`;
  const known = ALLOWED_PC_OPS.has(String(op)) || ALLOWED_PC_OPS.has(route);
  if (!known) return Response.json({ ok: false, error: "unknown op" }, { status: 400 });

  if (op === "status") {
    try {
      const res = await fetch(`${BRIDGE}/status`, { signal: AbortSignal.timeout(2500) });
      const data = await res.json();
      return Response.json(data);
    } catch {
      return Response.json({ ok: false, error: "bridge-not-running" });
    }
  }

  const token = await bridgeToken();
  if (!token) return Response.json({ ok: false, error: "bridge-not-installed" }, { status: 503 });

  // NOTE: there is deliberately no op that exposes the bridge token — the
  // stream/raw proxy routes read it server-side so it never reaches the browser.

  // Approval endpoints — match bridge's pending/approve routes
  if (op === "pending") {
    try {
      const res = await fetch(`${BRIDGE}/pending`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return Response.json(data);
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) });
    }
  }

  // Read current workspace (GET on the bridge — POST /workspace SETS it, and
  // with an empty body it CLEARS it, so reading must never use POST).
  if (op === "workspace") {
    try {
      const res = await fetch(`${BRIDGE}/workspace`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return Response.json(data);
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (op === "approve") {
    try {
      const res = await fetch(`${BRIDGE}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return Response.json(data);
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (op === "deny") {
    try {
      const res = await fetch(`${BRIDGE}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return Response.json(data);
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) });
    }
  }

  // Mode control
  if (op === "mode") {
    try {
      const res = await fetch(`${BRIDGE}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      return Response.json(data);
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) });
    }
  }

  // `route` was already normalized + whitelisted at the top of the handler.
  try {
    const res = await fetch(BRIDGE + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(300000),
    });
    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
}

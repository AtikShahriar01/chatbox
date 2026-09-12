// Security middleware — layer 1, runs before every request reaches a route.
//
//  1. Host allowlist  — the app answers only to localhost hostnames. If the
//     machine's LAN IP is used (or a DNS-rebinding domain resolves here),
//     the request is rejected. The app is local-first: nothing should talk
//     to it from another machine, period.
//  2. Origin check    — state-changing /api/* calls from another website are
//     rejected (blocks CSRF / drive-by attacks against the PC bridge).
//  3. Session gate    — pages require the session cookie (presence check for
//     routing UX). The REAL verification happens per /api/* route via
//     lib/session.js (HMAC + expiry, fail-closed) — middleware cannot read
//     the secret on the edge runtime, so it only redirects unauthenticated
//     page visits to /login.
//
// Route-level guard (lib/guard.js) repeats the Host/Origin checks as
// defense-in-depth and adds rate limits, size caps, client-header and op
// whitelists. lib/session.js enforces authentication server-side.

import { NextResponse } from "next/server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000",
  "http://localhost:3001", "http://127.0.0.1:3001",
]);

// LAN mode (start-server.bat sets CHATBOX_NETWORK=lan): the app may also be
// reached through the machine's private LAN IP — but still never through a
// public/attacker-controlled hostname (DNS rebinding stays blocked).
const LAN_MODE = process.env.CHATBOX_NETWORK === "lan";
const PRIVATE_IPV4 = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;
function hostAllowed(host) {
  if (!host) return true; // no Host header (some local tooling) — routes re-check
  if (LOCAL_HOSTS.has(host)) return true;
  if (LAN_MODE && (PRIVATE_IPV4.test(host) || /^\[?(fc|fd)[0-9a-f:]+\]?$/i.test(host))) return true; // private IPv4 + IPv6 ULA
  return false;
}
function originAllowed(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (LAN_MODE) {
    try {
      const h = new URL(origin).hostname;
      if (LOCAL_HOSTS.has(h) || PRIVATE_IPV4.test(h)) return true;
    } catch {}
  }
  return false;
}

const SESSION_COOKIE = "chatbox_session";
// public paths that never need a session
const PUBLIC_PATHS = ["/login", "/manifest.json", "/sw.js", "/icon-192.svg", "/icon-512.svg", "/monaco-vscode", "/media-player.html"];

export function middleware(req) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!hostAllowed(host)) {
    return new NextResponse("forbidden: this app only accepts localhost/LAN connections", { status: 403 });
  }

  const { pathname } = req.nextUrl;

  // ---- API: Host/Origin now; auth + rate limits inside each route ----
  const method = req.method.toUpperCase();
  if (pathname.startsWith("/api/")) {
    if (method !== "GET" && method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && !originAllowed(origin)) {
        return NextResponse.json({ ok: false, error: "cross-origin request blocked" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  // ---- Pages: redirect unauthenticated visits to /login (UX gate) ----
  const hasCookie = (req.cookies.get(SESSION_COOKIE)?.value || "").length > 0;
  if (!hasCookie) {
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!isPublic) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

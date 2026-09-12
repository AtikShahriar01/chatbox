// Security guard for API route handlers (production hardening layer).
// Every /api/* route calls guard() before doing any work.
//
// Layers provided here (defense-in-depth — middleware.js is layer 1):
//   1. Same-origin check   — a browser from another site can never call us
//                            (blocks CSRF + drive-by attacks on localhost apps)
//   2. Host allowlist      — DNS-rebinding protection
//   3. Client token header — required for /api/pc/* (simple cross-site forms
//                            and no-cors fetch can never set a custom header)
//   4. Body size cap       — memory-DoS protection
//   5. Rate limiting       — per-route sliding window
//   6. Bridge op whitelist — only known bridge routes may be forwarded

const WINDOW_MS = 60_000;
const buckets = new Map(); // key → { count, windowStart }
let lastSweep = Date.now();

function sweep() {
  const now = Date.now();
  if (now - lastSweep < 120_000) return;
  lastSweep = now;
  for (const [k, v] of buckets) if (now - v.windowStart > WINDOW_MS) buckets.delete(k);
}

export function rateLimit(key, maxPerMinute) {
  sweep();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  b.count += 1;
  if (b.count > maxPerMinute) {
    return { ok: false, retryAfter: Math.ceil((b.windowStart + WINDOW_MS - now) / 1000) };
  }
  return { ok: true };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost:3001", "http://127.0.0.1:3001"];
export const CLIENT_HEADER = "x-chatbox-client";
export const CLIENT_HEADER_VALUE = "chatbox-web-1";

// LAN mode (start-server.bat): private-IP hosts/origins are also trusted.
const LAN_MODE = process.env.CHATBOX_NETWORK === "lan";
const PRIVATE_IPV4 = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;
function originAllowed(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (LAN_MODE) {
    try {
      const h = new URL(origin).hostname;
      if (LOCAL_HOSTS.has(h) || PRIVATE_IPV4.test(h)) return true;
    } catch {}
  }
  return false;
}

// Only these bridge ops may be forwarded through /api/pc (nothing arbitrary).
export const ALLOWED_PC_OPS = new Set([
  "status", "pending", "workspace", "/workspace", "mode", "audit", "approve", "deny",
  "/file/list", "/file/read", "/file/write", "/file/edit", "/file/delete",
  "/file/mkdir", "/file/move", "/file/download",
  "/grep", "/search/files",
  "/exec", "/proc/start", "/proc/output", "/proc/stop", "/proc/list",
  "/term/create", "/term/write", "/term/output", "/term/kill", "/term/list",
  "/git/status", "/git/diff", "/git/log", "/git/branch", "/git/stage", "/git/checkout", "/git/commit",
  "/checkpoint/create", "/checkpoint/list", "/checkpoint/rollback",
  "/project/inspect", "/sysinfo",
  "/make/docx", "/make/xlsx", "/make/pptx", "/make/pdf", "/make/audio", "/make/video",
  "/tts/edge", "/voices/edge", "/office/preview", "/list/voices", "/edit/audio",
]);

/**
 * Gate every mutating API request. Returns a Response to send immediately,
 * or null when the request may proceed.
 * @param {Request} req
 * @param {object} opts
 * @param {number}  opts.maxBody        max accepted Content-Length bytes
 * @param {string}  opts.rateKey        unique key for the rate-limit bucket
 * @param {number}  opts.rateMax        max requests per minute for this route
 * @param {boolean} opts.requireClientHeader  force x-chatbox-client (dangerous routes)
 */
export function guard(req, { maxBody = 2 * 1024 * 1024, rateKey, rateMax = 120, requireClientHeader = false } = {}) {
  const url = new URL(req.url);

  // --- 2. Host allowlist: DNS rebinding points evil.com at 127.0.0.1 ---
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const hostOk = !host || LOCAL_HOSTS.has(host) || (LAN_MODE && PRIVATE_IPV4.test(host));
  if (!hostOk) {
    return json({ ok: false, error: "forbidden host" }, 403);
  }

  // --- 1. Origin check on every state-changing request. Browsers always send
  // Origin on cross-site POSTs — if it names another site, reject. Absent
  // Origin = non-browser client (curl/bridge tooling), which the custom-header
  // rule below still covers on the dangerous route.
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && !originAllowed(origin)) {
      return json({ ok: false, error: "cross-origin request blocked" }, 403);
    }
  }

  // --- 3. Custom client header for the PC-control route. Cross-site pages can
  // submit simple POSTs, but they cannot attach custom headers (CORS preflight
  // would fail), so this kills drive-by bridge access completely.
  if (requireClientHeader && req.headers.get(CLIENT_HEADER) !== CLIENT_HEADER_VALUE) {
    return json({ ok: false, error: "missing client header" }, 403);
  }

  // --- 4. Body size cap ---
  if (method !== "GET" && method !== "HEAD") {
    const len = Number(req.headers.get("content-length") || 0);
    if (len > maxBody) {
      return json({ ok: false, error: `body too large (max ${Math.round(maxBody / 1024)} KB)` }, 413);
    }
  }

  // --- 5. Rate limit ---
  if (rateKey) {
    const rl = rateLimit(rateKey, rateMax);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `rate limit reached — retry in ${rl.retryAfter}s` }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) } }
      );
    }
  }

  return null; // request may proceed
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

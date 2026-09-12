// SSE proxy: browser → /api/pc/stream?id=… → bridge /stream/:id?token=…
// Keeps the bridge token server-side (the browser only knows this endpoint).
// Requires a valid session cookie (same-origin EventSource sends it).

import { requireSession } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRIDGE = "http://127.0.0.1:8765";

export async function GET(req) {
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const since = searchParams.get("since") || "0";
  if (!id) return new Response("missing id", { status: 400 });

  let token = null;
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    token = (await readFile(path.join(process.cwd(), "..", "agent-bridge", "bridge-token.txt"), "utf8")).trim();
  } catch {
    return new Response("bridge not installed", { status: 503 });
  }

  let upstream;
  try {
    // cache: "no-store" is essential — Next's patched fetch would otherwise
    // try to buffer the infinite SSE stream for caching and never resolve.
    upstream = await fetch(`${BRIDGE}/stream/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}&since=${since}`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return new Response("bridge not running", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`bridge stream error (${upstream.status})`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

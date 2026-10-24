// GET /api/pc/html?path=... — serves an agent-written HTML file from the
// workspace as text/html so the IDE Preview pane can render it in a SANDBOXED
// iframe (sandbox without allow-same-origin → opaque origin: the page cannot
// touch the app's cookies, localStorage or API keys).
// The bridge stays the authority: token server-side, path confined to workspace.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "../../../../lib/session";
import { guard } from "../../../../lib/guard";

export const runtime = "nodejs";

const BRIDGE = "http://127.0.0.1:8765";
const TOKEN_FILE = path.join(process.cwd(), "..", "agent-bridge", "bridge-token.txt");
const MAX_HTML_BYTES = 5 * 1024 * 1024;

export async function GET(req) {
  const blocked = guard(req, { rateKey: "pc-html", rateMax: 60, maxBody: 4 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("path");
  // only .html/.htm — this endpoint exists to render agent-generated pages
  if (!p || !/\.html?$/i.test(p)) return new Response("only .html files", { status: 400 });
  if (p.length > 500) return new Response("bad path", { status: 400 });

  let token;
  try { token = (await readFile(TOKEN_FILE, "utf8")).trim(); } catch {
    return new Response("bridge-not-installed", { status: 503 });
  }

  try {
    const res = await fetch(`${BRIDGE}/file/raw?path=${encodeURIComponent(p)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "bridge error");
      return new Response(text, { status: res.status });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) return new Response("html too large", { status: 413 });
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        // belt & braces: the sandboxed iframe already denies same-origin
        "Content-Security-Policy": "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; form-action 'none'",
      },
    });
  } catch (e) {
    return new Response(String(e?.message || e), { status: 502 });
  }
}

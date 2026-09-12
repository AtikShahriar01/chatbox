// GET /api/pc/raw?path=... — streams a workspace file's raw bytes to the
// browser (for <img>/<audio>/<video> previews in the Agent Activity popup).
// The bridge stays the authority: token server-side, path confined.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "../../../../lib/session";

export const runtime = "nodejs";

const BRIDGE = "http://127.0.0.1:8765";
const TOKEN_FILE = path.join(process.cwd(), "..", "agent-bridge", "bridge-token.txt");

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  pdf: "application/pdf",
};

export async function GET(req) {
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("path");
  if (!p) return new Response("missing path", { status: 400 });

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
    const ext = (p.split(".").pop() || "").toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(String(e?.message || e), { status: 502 });
  }
}

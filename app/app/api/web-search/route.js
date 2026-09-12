// POST /api/web-search  { query, fetchPages? } → search results (+ page text)
// Server-side only: keeps the browser away from CORS and hides the user's IP
// from search engines. No API key required (DuckDuckGo HTML).

import { searchWithPages, searchWeb } from "../../../lib/web-search";
import { guard } from "../../../lib/guard";
import { requireSession } from "../../../lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  const blocked = guard(req, { rateKey: "web-search", rateMax: 12, maxBody: 16 * 1024 });
  if (blocked) return blocked;
  const unauthed = requireSession(req);
  if (unauthed) return unauthed;
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const query = String(body?.query || "").trim();
  if (!query) return Response.json({ ok: false, error: "Missing query" }, { status: 400 });
  if (query.length > 400) return Response.json({ ok: false, error: "Query too long" }, { status: 400 });

  try {
    const results = body.fetchPages === false
      ? await searchWeb(query, { limit: 6 })
      : await searchWithPages(query, { limit: 6, fetchTop: 3 });
    return Response.json({ ok: true, query, results });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }
}

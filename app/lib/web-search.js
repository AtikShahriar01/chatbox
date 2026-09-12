// Server-side web search for the chat — no API key needed.
// Uses DuckDuckGo's HTML endpoint (key-less) and optionally fetches the top
// pages for extra context. Runs ONLY on the server (/api/web-search) so the
// browser never hits CORS or exposes the user's IP to search engines directly.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s = "") { return decodeEntities(String(s).replace(/<[^>]*>/g, "")).trim(); }

// Parse DuckDuckGo's HTML results (result__a links + result__snippet).
export function parseDuckHtml(html) {
  const results = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets = [];
  let m;
  while ((m = snipRe.exec(html))) snippets.push(stripTags(m[1]));
  let i = 0;
  while ((m = re.exec(html)) && results.length < 8) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(url)) continue;
    const title = stripTags(m[2]);
    if (!title) continue;
    results.push({ title, url, snippet: snippets[i] || "" });
    i++;
  }
  return results;
}

// Search DuckDuckGo (HTML endpoint). Returns [{title, url, snippet}].
export async function searchWeb(query, { limit = 6 } = {}) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=wt-wt`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,bn;q=0.8" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const html = await res.text();
  return parseDuckHtml(html).slice(0, limit);
}

// Fetch a page and extract readable-ish text (script/style/nav stripped).
// SSRF guard (directive §11): result pages must be public http(s) — block
// loopback/private/metadata targets so a crafted result can never make the
// server read its own localhost services. (Limitation: hostname-level check;
// a hostname resolving to a private IP after DNS is not caught.)
const PRIVATE_HOST = /^(localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|\[fc|\[fd|metadata\.google\.internal$)/i;
function isPrivateHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m172 = host.match(/^172\.(\d+)\./);
    return PRIVATE_HOST.test(host) || (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31);
  } catch { return true; }
}

export async function fetchPageText(url, { maxChars = 4500 } = {}) {
  if (!/^https?:\/\//i.test(url || "")) throw new Error("non-http url");
  if (isPrivateHost(url)) throw new Error("private target blocked");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const type = res.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return "";
  let html = await res.text();
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
  const text = stripTags(html).replace(/\s+/g, " ").trim();
  return text.slice(0, maxChars);
}

// One call: search + enrich top results with page text.
export async function searchWithPages(query, { limit = 5, fetchTop = 3 } = {}) {
  const hits = await searchWeb(query, { limit });
  const enriched = await Promise.all(
    hits.map(async (h, i) => {
      if (i >= fetchTop) return { ...h, pageText: "" };
      try { return { ...h, pageText: await fetchPageText(h.url) }; }
      catch { return { ...h, pageText: "" }; }
    })
  );
  return enriched;
}

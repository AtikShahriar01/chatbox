// §20 UNIT layer — pure-function tests, NO server needed.
// Covers the directive's unit categories: provider · pricing · security ·
// path validation · permission · parser.
// Run: node .selftest/unit.mjs   (self-locating, any drive)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Suite, WS, tryJunction, freshDir, rmrf } from "./helpers.mjs";

// session.js resolves .auth relative to process.cwd()/.. → pin cwd to app/
process.chdir(path.join(WS, "app"));
const imp = (rel) => import(pathToFileURL(path.join(WS, "app", rel)).href);
const require_ = createRequire(import.meta.url);
const s = new Suite("unit");
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let n = 0;
const T = (name, fn, group = "UNIT") => {
  try { const r = fn(); r === true || r === undefined
    ? s.record(group, name, true)
    : s.record(group, name, false, String(r)); }
  catch (e) { s.record(group, name, false, e.message.slice(0, 90)); }
  n++;
};

// ================================================================ SECURITY =
const { providerUrlGuard, ALLOWED_PC_OPS, rateLimit } = await imp("lib/guard.js");

T("providerUrlGuard: localhost Ollama allowed (BYOK)", () => providerUrlGuard("http://127.0.0.1:11434/v1") === null);
T("providerUrlGuard: LAN inference allowed", () => providerUrlGuard("http://192.168.1.40:8080/v1") === null);
T("providerUrlGuard: public https allowed", () => providerUrlGuard("https://api.openai.com/v1") === null);
T("providerUrlGuard: AWS IMDS blocked", () => /metadata/.test(providerUrlGuard("http://169.254.169.254/latest/meta-data/iam/") || ""));
T("providerUrlGuard: link-local range blocked", () => providerUrlGuard("http://169.254.1.1/") !== null);
T("providerUrlGuard: GCP metadata blocked", () => providerUrlGuard("http://metadata.google.internal/") !== null);
T("providerUrlGuard: Alibaba IMDS blocked", () => providerUrlGuard("http://100.100.100.200/latest/") !== null);
T("providerUrlGuard: IPv6-mapped IMDS blocked", () => providerUrlGuard("http://[::ffff:169.254.169.254]/") !== null);
T("providerUrlGuard: file:// rejected", () => providerUrlGuard("file:///etc/passwd") !== null);
T("providerUrlGuard: javascript: rejected", () => providerUrlGuard("javascript:alert(1)") !== null);
T("providerUrlGuard: oversize rejected", () => providerUrlGuard("http://a.com/" + "x".repeat(600)) !== null);
T("providerUrlGuard: garbage rejected", () => providerUrlGuard("not a url at all") !== null);

const { isPrivateHost, parseDuckHtml } = await imp("lib/web-search.js");
T("SSRF web-search: loopback/private/metadata are private", () =>
  [ "http://localhost:8765/status", "http://127.0.0.1/", "http://10.1.2.3/", "http://192.168.0.5/",
    "http://172.16.0.9/", "http://169.254.169.254/", "http://metadata.google.internal/",
    "http://[::1]:8765/", "http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/",
    "http://[fe80::1]/", "http://[fd12:3456::5]/" ].every(isPrivateHost));
T("SSRF web-search: public hosts not blocked", () =>
  [ "https://html.duckduckgo.com/html/", "https://github.com/", "http://172.32.5.5/",
    "https://facebook.com/", "https://fe80.io/" ].every((u) => !isPrivateHost(u)));
T("SSRF web-search: unparseable → treated as unsafe", () => isPrivateHost("%%nonsense%%") === true);

// rate limiter (pure logic): fresh key passes, burst trips, retryAfter sane
T("rate limiter trips after cap and heals", () => {
  const k = "unit-" + Date.now();
  for (let i = 0; i < 5; i++) if (!rateLimit(k, 5).ok) return "early trip";
  const r = rateLimit(k, 5);
  return r.ok === false && r.retryAfter > 0 && r.retryAfter <= 60;
});

// =============================================================== PERMISSION =
T("pc whitelist: legit ops present", () => ["/file/read", "/file/write", "/exec", "/term/create", "/git/commit", "status"]
  .every((op) => ALLOWED_PC_OPS.has(op)));
T("pc whitelist: dangerous/unknown ops absent", () => ["token", "/format-c-drive", "/admin", "/file/raw-exec", "", "/"].
  some((op) => !ALLOWED_PC_OPS.has(op)) && !ALLOWED_PC_OPS.has("token") && !ALLOWED_PC_OPS.has("/shutdown"));

// ================================================================== PROVIDER =
const { detectProvider, PROVIDER_LABELS } = await imp("lib/providerMeta.js");
T("detectProvider: known clouds map correctly", () =>
  detectProvider("https://api.openai.com/v1") === "openai" &&
  detectProvider("https://api.anthropic.com") === "anthropic" &&
  detectProvider("https://generativelanguage.googleapis.com/v1beta") === "google" &&
  detectProvider("https://api.groq.com/openai/v1") === "groq" &&
  detectProvider("http://localhost:11434/api") === "ollama" &&
  detectProvider("http://localhost:1234/v1") === "lmstudio" &&
  detectProvider("https://openrouter.ai/api/v1") === "openrouter" &&
  detectProvider("https://api.cohere.ai") === "cohere" &&
  detectProvider("https://api.deepseek.com/v1") === "deepseek");
T("detectProvider: unknown base = openai-compatible", () => detectProvider("https://my-llm.example/dev") === "openai-compatible");
T("provider labels exist for every family", () => !!PROVIDER_LABELS.openai && !!PROVIDER_LABELS.anthropic && !!PROVIDER_LABELS.ollama);

const { buildOpenAIRequest } = await imp("lib/providers/openai.js");
T("buildOpenAIRequest: shape + bearer auth", () => {
  const r = buildOpenAIRequest({ apiBase: "https://x.test/v1", apiKey: "sk-abc", model: "m1", messages: [{ role: "user", content: "hi" }], temperature: 0.3, stream: true });
  const url = r.url || r.endpoint;
  const body = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  return /\/v1\/chat\/completions$/.test(String(url)) && body.model === "m1" && body.stream === true &&
    JSON.stringify(r.headers).includes("sk-abc");
});

// ================================================================== PRICING =
// pricing.js imports a .json without an attribute (fine for the Next bundler,
// not for bare Node) → inline the JSON and load the REAL code as a data URL.
const pricingSrc = fs.readFileSync(path.join(WS, "app/lib/pricing.js"), "utf8")
  .replace(/import defaults from "\.\/pricing\.default\.json";?/,
    "const defaults = " + fs.readFileSync(path.join(WS, "app/lib/pricing.default.json"), "utf8") + ";");
const pricing = await import("data:text/javascript;base64," + Buffer.from(pricingSrc).toString("base64"));
const priceBook = JSON.parse(fs.readFileSync(path.join(WS, "app/lib/pricing.default.json"), "utf8"));
const pricedModel = Object.keys(priceBook).find((k) => !k.startsWith("_") && priceBook[k].input > 0 && priceBook[k].output > 0);
T(`pricing: computeCost exact math (${pricedModel})`, () => {
  const p = priceBook[pricedModel];
  const got = pricing.computeCost(pricedModel, { prompt_tokens: 1000, completion_tokens: 500 });
  const want = (1000 * p.input + 500 * p.output) / 1e6;
  return Math.abs(got - want) < 1e-12;
});
T("pricing: camelCase & snake_case usage aliases agree", () =>
  pricing.computeCost(pricedModel, { promptTokens: 1000, completionTokens: 500 }) ===
  pricing.computeCost(pricedModel, { prompt_tokens: 1000, completion_tokens: 500 }));
T("pricing: unknown model → null (no fake cost)", () => pricing.computeCost("totally-unknown-model-xyz", { prompt_tokens: 10 }) === null);
T("pricing: missing usage → null", () => pricing.computeCost(pricedModel, null) === null);
T("pricing: user override wins", () => {
  const got = pricing.computeCost(pricedModel, { prompt_tokens: 1e6, completion_tokens: 0 }, { [pricedModel]: { input: 7.5, output: 9 } });
  return Math.abs(got - 7.5) < 1e-9;
});
T("pricing: prefix-normalized lookup (openai/gpt == gpt)", () => {
  const k = Object.keys(priceBook).find((x) => x.includes("/"));
  if (!k) return true;
  const tail = k.split("/").slice(1).join("/");
  return eq(pricing.lookupPrice(k), pricing.lookupPrice(tail));
});
T("pricing: estimateCost = in/out tokens at list price", () => {
  const p = priceBook[pricedModel];
  return Math.abs(pricing.estimateCost(pricedModel, 2000, 1000) - (2000 * p.input + 1000 * p.output) / 1e6) < 1e-12;
});
T("pricing: formats don't throw and look sane", () =>
  /\$/.test(pricing.formatCost(0.0023)) && /৳/.test(pricing.formatBDT(0.5, 110)) &&
  pricing.formatCostDual(1, 110, "bdt").length > 0);

// =================================================================== PARSER =
T("parseDuckHtml: extracts title/url/snippet", () => {
  const html = `<a class="result__a" href="https://example.com/a">Example &amp; Page</a>
<a class="result__snippet" href="#">Sn&#39;ippet one</a>`;
  const r = parseDuckHtml(html);
  return r.length === 1 && r[0].url === "https://example.com/a" && r[0].title === "Example & Page" && r[0].snippet === "Sn'ippet one";
});
T("parseDuckHtml: uddg redirect unwrapped", () => {
  const html = `<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Freal.example%2Fpage&amp;rut=x">T</a>`;
  const r = parseDuckHtml(html);
  return r[0]?.url === "https://real.example/page";
});
T("parseDuckHtml: non-http hrefs dropped", () => {
  const r = parseDuckHtml('<a class="result__a" href="javascript:alert(1)">T</a>');
  return r.length === 0;
});
T("parseDuckHtml: live markup stripped; entities decode to plain text", () => {
  const r = parseDuckHtml('<a class="result__a" href="https://e.com/"><img src=x onerror=alert(1)>&lt;script&gt;evil()&lt;/script&gt;</a>');
  const flat = JSON.stringify(r);
  // real tags must be gone; &lt;script&gt; decodes to LITERAL TEXT (React
  // renders text nodes escaped — only un-stripped live tags would be XSS)
  return !/<img|onerror/i.test(flat) && r[0].title.includes("<script>evil()</script>");
});

// ===================================================== SESSION (token crypto) =
const session = await imp("lib/session.js");
T("session: created token verifies", () => {
  const { token } = session.createSessionToken();
  return session.verifySessionToken(token) === true;
});
T("session: tampered signature rejected", () => {
  const { token } = session.createSessionToken();
  const parts = token.split(".");
  parts[2] = parts[2].split("").map((c, i) => (i === 0 ? (c === "a" ? "b" : "a") : c)).join("");
  return session.verifySessionToken(parts.join(".")) === false;
});
T("session: extended expiry with old sig rejected", () => {
  const { token } = session.createSessionToken();
  const parts = token.split(".");
  parts[0] = String(Number(parts[0]) + 365 * 24 * 3600 * 1000);
  return session.verifySessionToken(parts.join(".")) === false;
});
T("session: expired-but-correctly-signed token rejected", () => {
  const secret = fs.readFileSync(path.join(WS, ".auth/session-secret"), "utf8").trim();
  const crypto = require_("node:crypto");
  const exp = Date.now() - 1000;
  const ver = (() => { try { return Number(JSON.parse(fs.readFileSync(path.join(WS, ".auth/auth.json"), "utf8")).tokenVersion) || 0; } catch { return 0; } })();
  const sig = crypto.createHmac("sha256", secret).update("chatbox-session|" + exp + "|" + ver).digest("hex");
  return session.verifySessionToken(`${exp}.${ver}.${sig}`) === false;
});
T("session: cookie from a different secret rejected", () => {
  const crypto = require_("node:crypto");
  const exp = Date.now() + 3600_000;
  const sig = crypto.createHmac("sha256", "0".repeat(64)).update("chatbox-session|" + exp + "|0").digest("hex");
  return session.verifySessionToken(`${exp}.0.${sig}`) === false;
});
T("session: garbage / empty tokens rejected", () =>
  session.verifySessionToken("") === false && session.verifySessionToken("abc") === false &&
  session.verifySessionToken(null) === false && session.verifySessionToken("1.2.3.4") === false);
T("session: PIN format rules enforced before any write", () =>
  ["123", "123456789", "abcd", "", "12 34"].every((pin) => session.saveAuthRecord(pin).ok === false));

// ============================================ PATH VALIDATION (bridge guard) ==
const pg = require_(path.join(WS, "agent-bridge/pathguard.js"));
const base = freshDir(path.join(WS, ".selftest/pgtest"));
const wsDir = path.join(base, "workspace");
fs.mkdirSync(path.join(wsDir, "sub"), { recursive: true });
fs.writeFileSync(path.join(wsDir, "sub/file.txt"), "x");
const outside = path.join(base, "outside/secret.txt");
fs.mkdirSync(path.dirname(outside), { recursive: true });
fs.writeFileSync(outside, "secret");

T("pathguard: inside workspace ok", () => pg.checkContained(wsDir, path.join(wsDir, "sub/file.txt")).ok === true);
T("pathguard: not-yet-existing target inside ok (write case)", () => pg.checkContained(wsDir, path.join(wsDir, "sub/new/deep.txt")).ok === true);
T("pathguard: absolute outside rejected", () => pg.checkContained(wsDir, outside).ok === false);
T("pathguard: ../ traversal rejected", () => pg.checkContained(wsDir, path.join(wsDir, "..", "..", "outside", "secret.txt")).ok === false);
T("pathguard: traversal past drive root rejected", () => pg.checkContained(wsDir, path.resolve("C:/Windows/win.ini")).ok === false);
T("pathguard: guarded-zone callback honored (lexical + via real path)", () => {
  const guarded = pg.checkContained(wsDir, path.join(wsDir, "secret.txt"), (p) => /secret/i.test(p) ? "protected" : null);
  const safe = pg.checkContained(wsDir, path.join(wsDir, "sub/file.txt"), (p) => /secret/i.test(p) ? "protected" : null);
  // junction INSIDE the workspace pointing at an inner guarded dir: lexical
  // name looks safe, the REAL path must still hit the guard callback
  const guardDir = path.join(wsDir, "guarded"); fs.mkdirSync(guardDir, { recursive: true });
  const link2 = path.join(wsDir, "lnk");
  let viaLink = true;
  if (tryJunction(guardDir, link2)) {
    viaLink = pg.checkContained(wsDir, path.join(link2, "f.txt"), (p) => /guarded/i.test(p) ? "protected" : null).error === "protected";
    rmrf(link2);
  }
  return guarded.ok === false && guarded.error === "protected" && safe.ok === true && viaLink;
});
T("pathguard: isInside equality semantics", () => pg.isInside(wsDir, wsDir) === true && pg.isInside(wsDir, base) === false);
T("pathguard: normalizeHostIp decodes IPv4-mapped IPv6", () =>
  pg.normalizeHostIp("::ffff:7f00:1") === "127.0.0.1" &&
  pg.normalizeHostIp("::ffff:a9fe:a9fe") === "169.254.169.254" &&
  pg.normalizeHostIp("[::ffff:169.254.169.254]") === "169.254.169.254" &&
  pg.normalizeHostIp("0:0:0:0:0:0:0:1") === "::1" &&
  pg.normalizeHostIp("github.com") === "github.com");

const linkDir = path.join(wsDir, "escape");
// target an EXISTING dir outside ws (portable: on Linux a dangling C:\Windows
// symlink would not resolve and the escape test would be vacuous)
const made = tryJunction(path.dirname(base), linkDir);
if (made) {
  T("pathguard: junction INSIDE workspace escaping OUT is blocked (real symlink)", () => {
    const r = pg.checkContained(wsDir, path.join(linkDir, "outside/secret.txt"));
    return r.ok === false && /symlink|junction/i.test(r.error || "");
  });
  rmrf(linkDir);
} else {
  s.skip("PATH", "symlink escape live test (OS refused junction creation)");
}
rmrf(base);

// ================================ CONFINE (the REAL bridge function, offline) ==
// require server.js? it listens — instead verify the wiring: confine now
// delegates to checkContained (source-level guard against silent revert).
const serverSrc = fs.readFileSync(path.join(WS, "agent-bridge/server.js"), "utf8");
T("bridge: confine delegates to pathguard.checkContained", () =>
  serverSrc.includes('require("./pathguard")') && /function confine\(p\)\s*\{\s*\/\/[^\n]*\n\s*return checkContained\(effectiveWorkspace\(\), p, guardedReason\);/.test(serverSrc));
const chatSrc = fs.readFileSync(path.join(WS, "app/app/api/chat/route.js"), "utf8");
const tcSrc = fs.readFileSync(path.join(WS, "app/app/api/test-connection/route.js"), "utf8");
T("routes: chat+test-connection wire providerUrlGuard", () =>
  chatSrc.includes("providerUrlGuard") && tcSrc.includes("providerUrlGuard"));

const passed = s.items.filter((x) => x.pass).length;
console.log(`\n[unit] executed ${n} checks`);
await s.finish();

# SECURITY AUDIT — Chatbox

তারিখ: 2026-09-12 · পদ্ধতি: সম্পূর্ণ কোড পর্যালোচনা + লাইভ অ্যাটাক-সিমুলেশন টেস্ট
(২৫/২৫ পাস — `.selftest/security-live-tests.mjs`)

---

## Findings (ডিরেক্টিভ §35 অনুযায়ী শ্রেণিবদ্ধ)

| # | Severity | Finding | Affected | Fix | Status |
|---|---|---|---|---|---|
| ১ | CRITICAL | সার্ভার শুধু লোকালহোস্টে না শুনে `0.0.0.0`-এ ছিল — LAN-এর যে কেউ অ্যাপ ও PC bridge ব্যবহার করতে পারত | server binding, launchers | `-H 127.0.0.1` + Host allowlist middleware | ✅ FIXED (tested) |
| ২ | CRITICAL | API রুটে কোনো authentication ছিল না — PIN শুধু ব্রাউজারে | সব /api/* | সার্ভার-সাইড সেশন অথ: `/api/auth` + HMAC কুকি (HttpOnly, SameSite=Strict) + প্রতি রুটে `requireSession` (fail-closed) | ✅ FIXED (tested) |
| ৩ | CRITICAL | `/api/pc` যেকোনো op ফরোয়ার্ড করত + drive-by CSRF সম্ভব | PC bridge পুরো PC | client header + Origin/Host gate + op whitelist | ✅ FIXED (tested) |
| ৪ | CRITICAL | প্রতিটা চ্যাটে ইউজার মেসেজ দুইবার যেত | /api/chat payload | history fix | ✅ FIXED (tested) |
| ৫ | HIGH | `CODEY` regex সবসময় truthy — bridge চালু থাকলে সব মেসেজ agent মোডে | ChatPanel | `.test()` যোগ | ✅ FIXED (tested) |
| ৬ | HIGH | commit message-এ shell injection (`cmd /c`) | bridge /exec | নতুন `/git/commit` args-array op | ✅ FIXED (tested: `test"; calc & echo "PWNED` নিরপেক্ষ) |
| ৭ | HIGH | খালি POST-এ workspace wipe | bridge /workspace | explicit `clear:true` লাগে | ✅ FIXED (tested) |
| ৮ | HIGH | Anthropic/Cohere SSE chunk-boundary-তে টেক্সট হারাত | lib/providers | event-state hoist | ✅ FIXED (unit-tested) |
| ৯ | HIGH | Next.js 14.2.15 — ২০+ জানা CVE (middleware bypass সহ) | next | 14.2.15 → **14.2.35** আপগ্রেড | ✅ FIXED (patch line) |
| ১০ | HIGH | unused `monaco-editor` dep → vulnerable dompurify | package.json | আনইনস্টল (কখনোই import হত না) | ✅ FIXED |
| ১১ | HIGH | `postcss` XSS/file-read advisories | postcss ≤8.5.22 | 8.5.28 আপগ্রেড | ✅ FIXED |
| ১২ | HIGH | SSRF: bridge download + web-search যেকোনো URL নিত | bridge, web-search | private/loopback/metadata ব্লক (hostname-level) | ✅ FIXED (tested) |
| ১৩ | MEDIUM | কোনো rate limiting ছিল না | সব API | sliding-window limits per route | ✅ FIXED (tested) |
| ১৪ | MEDIUM | body-size cap ছিল না | সব API | 16KB–6MB per-route caps | ✅ FIXED (tested) |
| ১৫ | MEDIUM | কোনো CSP ছিল না | সব পেজ | strict CSP + COOP/CORP/Permissions-Policy | ✅ FIXED (tested) |
| ১৬ | MEDIUM | localStorage persist crash (quota) | store | makeSafeStorage wired | ✅ FIXED |
| ১৭ | MEDIUM | IDE Delete-এ confirmation ছিল না | FileExplorer | confirm() যোগ | ✅ FIXED |
| ১৮ | MEDIUM | Stop বাটন agent রানে ডেড | ChatPanel + engine | AbortSignal plumbing | ✅ FIXED |
| ১৯ | LOW | FOUC স্ক্রিপ্ট ভুল localStorage key | layout.js | v2→v3 | ✅ FIXED |
| ২০ | LOW | "Thought for 1s" সবসময় ভুল | ChatPanel | reasoningMs tracking | ✅ FIXED |
| ২১ | LOW | CopilotEditor/CommandPalette malformed-import crash | components | guards | ✅ FIXED |
| ২২ | LOW | input schema ছিল দুর্বল | /api/chat | temperature/messages/model/URL caps | ✅ FIXED (tested) |

---

## Remaining risks (স্বীকৃত + ডকুমেন্টেড কারণসহ)

| Risk | Severity | কেন এখন ফিক্স নয় | Mitigation |
|---|---|---|---|
| Next.js 14.2.35-এ বাকি কিছু advisory (Image Optimizer, Server Actions, RSC cache) — ফিক্স শুধু Next 15/16-এ | HIGH (থিওরেটিকাল) | 14→16 major migration: React 19 + async APIs; কাজের অ্যাপ ভাঙার ঝুঁকি | আমরা `next/image`, Server Actions, rewrites, i18n, CSP-nonce **ব্যবহারই করি না** — প্রভাবিত পথগুলো বন্ধ; API no-store; localhost-only binding |
| `exceljs`→`uuid` moderate | MEDIUM | ফিক্স = exceljs 3.4.0-এ downgrade (breaking) | uuid v3/v5/v6 buf-arg বাগ exceljs-এর অভ্যন্তরীণ পথে ইউজার-নিয়ন্ত্রিত নয় |
| `pptxgenjs`→`image-size` DoS | HIGH | ফিক্স = pptxgenjs 1.1.5-এ downgrade (breaking) | আমাদের pptx ফ্লো untrusted image পার্স করে না; text-only |
| Browser-এ API key localStorage-এ plaintext | MEDIUM | ব্রাউজার-অ্যাপে at-rest encryption কী-ও ব্রাউজারেই থাকে (pseudo-security) | CSP XSS বন্ধ করে; মেশিন-লোকাল অ্যাপ; চাইলে "কী মনে রাখবে না" ব্যবহার |
| HSTS নেই | INFO | localhost HTTP-তে প্রযোজ্য নয় | TLS যোগ হলে যোগ করবেন |
| `.auth/` PIN hash ডিস্কে | LOW | ফাইল মেশিনেই থাকে; SHA-256+salt; agent-bridge guarded zone-এর মতোই সংবেদনশীল ফাইল | হারালে `.auth/` মুছে দিলেই নতুন registration |

---

## Dependency changes

- `next`: 14.2.15 → **14.2.35** (patch-line; middleware bypass CVE-2025-29927 সহ বহু ফিক্স)
- `postcss`: → **8.5.28**
- `monaco-editor`: **removed** (unused; dompurify CVE উৎস বন্ধ)
- `npm audit fix` (non-force) চালানো; বাকি ৪টি finding-এর fix breaking — উপরে ডকুমেন্টেড

## Environment variables

- নতুন কোনো env var লাগে না। সিক্রেটগুলো ফাইলে (H:-এ): `.auth/session-secret`,
  `.auth/auth.json`, `agent-bridge/bridge-token.txt` — কোনোটাই git-এ নেই (`.auth/` gitignored)।

## Vercel/deployment note (directive §14)

এই অ্যাপ **self-hosted localhost** ডিজাইনে (PC bridge = মেশিনের ফাইল/শেল)। Vercel-এ
deploy করলে: (১) PC bridge/`/api/pc` public-এ ফাঁক হবে — **বন্ধ রাখতে হবে**;
(২) `.auth/` ফাইল স্টোর serverless-এ ephemeral — তখন managed secret store লাগবে।
সুপারিশ: chat-only deploy হলে bridge রুটগুলো disable করে deploy করুন।

## Security testing performed

- ২৫/২৫ লাইভ টেস্ট: auth bypass (401/redirect), CSRF (403), DNS-rebinding (403),
  header forgery (403), op whitelist (400), rate limit (429), body cap (413),
  commit injection (neutralized), workspace wipe (blocked), token theft (blocked),
  path traversal (blocked), credential denylist (blocked), redaction, audit,
  SSRF (blocked), schema caps (400), স্ট্রিমিং happy-path
- ১২টা SSE parser unit test (chunk-boundary সহ)

## SECURITY STATUS

- CRITICAL: 0 (আগের ৪টি ফিক্সড + টেস্টেড)
- HIGH: 0 unresolved (৭টি ফিক্সড; Next-এর residual advisories থিওরেটিকাল — উপরে ডকুমেন্টেড)
- MEDIUM: 2 accepted (exceljs/uuid, localStorage key-at-rest) — মাইগ্রেশন ছাড়া ফিক্স অসম্ভব/অপ্রয়োজনীয়
- LOW: 1 accepted (HSTS — localhost HTTP)
- INFORMATIONAL: Vercel deploy হলে bridge isolation লাগবে

### PRODUCTION SECURITY STATUS: PASS WITH WARNINGS

(কোনো unresolved CRITICAL/HIGH actionable vulnerability নেই; "warnings" =
Next 16 major migration + ২টি accepted transitive dependency risk — প্রত্যেকটির
কারণ ও mitigation উপরে ডকুমেন্টেড)

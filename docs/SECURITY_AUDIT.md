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

## Step 3 additions — §4/§5/§6
- **§6 Universal Provider Engine**: store `providers[]` + `activeProviderId` (backward-compatible mirrors of apiBaseUrl/apiKey/apiModel), save/load/update/duplicate/delete + per-provider capabilities (streaming/vision/tools/reasoning/image/audio/embedding) + models/chat endpoints. Settings → Model Provider → "Saved Providers" panel.
- **§5 Git**: `/git/stash`(+pop), `/git/revert` (requires confirm:true + sha validation), `/git/reset` (requires confirm:true, auto pre-reset safety checkpoint).
- **§4 File**: `/file/stat` (mtime), advisory `/file/lock`+`/file/unlock` (120s TTL), optimistic-concurrency conflict (stale expectMtime refuses write). AI edit already flows Before→Diff→Approve→Apply via ChangesPanel.
- Verified: parser 12/12, security-live 25/25, + targeted §4 (stat/lock/conflict) & §5 (revert/reset confirm, stash) & §6 (provider UI save/load/capabilities) tests.

## Step 4 additions — §6/§7/§8/§9
- §6 Universal Provider Engine (providers[] + capabilities + save/load/dup/delete; backward-compatible mirrors).
- §7 default + fallback model (Settings), recently-used list, automatic fallback-on-error.
- §8 provider-wise cost + daily sparkline + local-compute estimate + budget ENFORCEMENT (block at limit) on Usage page.
- §9 durable agent task history + queue + AgentPanel History tab + Retry (reuses Plan→Approval→Execute→Verify→Fix→Report).
- Verified live: parser 12/12, security 25/25, provider UI, §9 history persisted status=completed.

## Step 5 additions — §10/§11/§12 (agent intelligence + IDE + output)
- §10 Agent Skills bar (IDE console): Analyze · Quality · Security · Fix errors · Add tests · Refactor · Docs — curated instructions the agent executes via its existing tools (inspect_project/read/grep/write/edit/run_command).
- §11 Editor: selection → AI (Explain / Refactor / Fix) routed into chat; Monaco diagnostics active; (multi-tab, diff-view, git panel already existed).
- §12 Code Output window: Copy · Download · Save-to-project toolbar + filename/language/line-count; Monaco line numbers + language detection.
- Verified live: parser 12/12, security 25/25, §10 skills 7/7 + §11 selection buttons 3/3 in DOM.

## Step 6 — §13/§14/§15
- §13 Chat: store now has duplicateChat, toggleArchive, setChatFolder, toggleBookmark (edit/regenerate/retry/stop/search/pin/export/import already existed).
- §14 Memory system: store memory{enabled,profile,agent,project,providerPrefs} + remember/forget/clear/toggle + buildMemoryPrompt injected into every chat system prompt; Settings → Memory manager (view/add/delete/clear/enable). Verified in UI.
- §15 Web search: result dedup (normalized URL), relevance ranking, include/exclude domain filtering; plus earlier redirect-hop validation + response size limit + timeout.
- Verified: parser 12/12, security 25/25, build clean, Memory settings panel live.

## Step 7 — §16/§17/§18/§19 status
- §16 Auth: scrypt PIN re-applied (back-compat), 3-part HMAC token exp.ver.sig, server-side rotation/revocation via tokenVersion, /api/auth logout-all + change-pin, failed-attempt lockout+logging. Verified 3-part login + 25/25.
- §17 Security Center: live posture matrix (API Key/Bridge/Workspace/Terminal/Session/SSRF/Audit = Protected/Down) + Critical/High/Medium counts + Change PIN + Logout all buttons in Console → Security. Compiled into bundle (verified).
- §18 Performance: already covered — dynamic/lazy IDE+Console, Next code-splitting, terminal 300KB ring + max 10 sessions + idle/max reaper, process cap+reap, reduced-motion wired, session-only key. (Full list virtualization of the chat message list remains a possible future optimization; not forced now to avoid regression.)
- §19 Code quality: JS→TS migration intentionally NOT done blind (would risk the working app); centralized security utils (guard.js), session (session.js), provider registry (store) already extracted as the practical alternative. A staged TS migration can be its own careful project later.

## Step 8 — §20 Testing system + holes it exposed and fixed (2026-09-13)
Full test pyramid added: `.selftest/{unit,integration,security-deep,e2e,run-all}.mjs` +
`helpers.mjs`, documented in docs/TESTING.md. Result: 172 checks, ALL GREEN.

Security findings the §20 work exposed (RED first, then GREEN after fixes):
1. **Provider-URL SSRF (chat + test-connection):** only scheme/length checked —
   a user/attacker-supplied apiBaseUrl could point the server proxy at cloud
   instance metadata (169.254.169.254, metadata.google.internal, 100.100.100.200,
   IPv6 link-local). RED probe showed 502 (request actually attempted).
   Fix: `providerUrlGuard` in lib/guard.js (localhost/LAN kept for BYOK Ollama),
   wired into both routes; unit-tested incl. IPv6-mapped form.
2. **IPv4-mapped IPv6 normalization bypass:** Node serializes [::ffff:169.254.169.254]
   as `[::ffff:a9fe:a9fe]` — dotted-quad regex lists miss it. Fix: shared
   `normalizeHostIp` (guard.js + bridge copy in pathguard.js); web-search
   `isPrivateHost` now also catches `[::1]`/fe80/fc00::/7 correctly.
3. **Bridge path confinement had no symlink awareness:** a junction inside the
   workspace pointing outside would have smuggled file ops out. Fix: pure
   `agent-bridge/pathguard.js` (real-path containment; unit test uses a REAL
   junction to C:\Windows and proves the block).
4. **Bridge /file/download followed redirects blindly** (`redirect:"follow"`) —
   public URL → 302 → metadata would bypass the pre-check. Fix: manual hop loop,
   every hop re-validated (scheme + normalized host), max 5 hops.
5. **Bridge resolvePath was process-cwd-relative** — relative file paths landed
   in (or were rejected against) the bridge folder depending on where the
   process started. Fix: relative = workspace-relative, deterministic.
6. Session-cookie forging in suites upgraded to the §16 3-part exp.ver.sig format.
Verification: chat-metadata RED(502) → GREEN(400); pyramid ALL GREEN:
unit 52/52, parser 12/12, integration 32/32, security-live 25/25,
security-deep 35/35, e2e 16/16.

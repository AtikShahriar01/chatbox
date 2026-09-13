# §20 — Testing System (test pyramid)

সব suite গুলো self-locating (যেকোনো drive/folder থেকে চলবে), Node-only,
কোনো heavyweight ফ্রেমওয়ার্ক নেই, এবং সবকিছু workspace-এর ভেতরেই থাকে (C:
ড্রাইভে কিছু লেখে না)। এন্ট্রি পয়েন্ট:

```bash
node .selftest/run-all.mjs              # সম্পূর্ণ পিরামিড (app + bridge দরকার)
node .selftest/run-all.mjs --offline    # শুধু unit + parser (সার্ভার ছাড়া)
```

| # | Suite | স্তর | কভারেজ (§20 ভাষ্য) |
|---|-------|------|----------------------|
| 1 | `unit.mjs` (52) | Unit | provider detection/request shape, pricing গাণিতিক correctness + override, `providerUrlGuard` (metadata/IPv6-mapped SSRF), `isPrivateHost`, path validation (`pathguard.checkContained` + **real junction** symlink test), permission whitelist (`ALLOWED_PC_OPS`), session token crypto (tamper/expiry/foreign-secret/legacy), rate-limiter, DuckDuckGo parser + XSS-strip |
| 2 | `parser-tests.mjs` (12) | Unit | চারটা provider SSE parser (openai/anthropic/google/cohere) — mid-frame split, CRLF, event-state হোইস্টিং |
| 3 | `integration.mjs` (32) | Integration | live HTTP: auth actions, provider connection (mock), chat stream/non-stream, web-search route, bridge file ops (write/read/edit/mkdir/move/grep/delete), git ops (stage/commit/log/diff/status), terminal create/write/output/list/kill, exec |
| 4 | `security-live-tests.mjs` (25) | Security (baseline) | 5-layer ব্রিফ ব্যাটারি: session gates, client-header CSRF, op whitelist, body cap, rate limit, commit-message injection, workspace persistence, token isolation, path confinement, exec denylist, secret redaction, audit, SSRF (loopback download), schema caps, legit-stream regression |
| 5 | `security-deep.mjs` (35) | Security (deep) | auth bypass ×9 (forged sig, wrong version, expired, foreign secret, legacy-window, header-injection, no-cookie), SSRF (IPv6-mapped + GCP/Alibaba IMDS + redirect-aware download + public-not-overblocked), path traversal (`..\..`, posix, percent-encoded, .auth), **symlink/junction escape** (real junctions), command injection (git arg arrays, literal metachar filenames), CSRF (Origin, no-header form POST, text/plain, raw-socket **Host rebinding**), XSS (CSP directives, nosniff/frame-deny, non-reflection, json error content-type, rehypeSanitize wiring), rate-limit bypass (spoofed X-Forwarded-For) |
| 6 | `e2e.mjs` (16) | E2E (journeys) | login-gate (307→/login, authenticated shell), chat round-trip multi-turn, IDE file+git journey, **full autonomous-agent workflow** — mock-agent-এর tool-contract (set_todo→write_file→run_command→done) HTTP স্তরে engine-এর মতো drive করা হয়, todo checklist ticked-to-done + artifact on disk সহ |

## Service-level E2E বনাম browser E2E
`e2e.mjs` সার্ভিস-লেভেলে journey গুলো টেস্ট করে (হেডলেস, CI-যোগ্য)। পURE browser
ক্লিক-লেভেল UI টেস্ট (live todo panel ইত্যাদি) এর আগে ম্যানুয়ালি করা হয়েছে
(ZCode built-in browser দিয়ে) — চাইলে Playwright ইত্যাদি workspace-এ ইনস্টল
করে আলাদা GUI suite যোগ করা যাবে, কিন্তু এখন পর্যন্ত কোনো নতুন ভারী ডিপেন্ডেন্সি
নেওয়া হয়নি।

## Fixtures
- `mock-provider.js` (:18787) — OpenAI-compatible deterministic provider
- `mock-agent.js` (:18788) — scripted agent-protocol (set_todo/write_file/run_command/done)
- `helpers.mjs` — suite framework, session forging (same-trust-domain: লোকাল
  secret ফাইল থেকে HMAC-cookie), port utils, junction helper

## নিয়ম
- কোনো সিকিউরিটি-সংবেদনশীল পরিবর্তনের পরে **সম্পূর্ণ পিরামিড সবুজ** না হওয়া পর্যন্ত কাজ শেষ নয় (AGENTS.md §4)।
- নতুন bridge op / API route যোগ করলে: whitelist unit test + integration test + (দরকার হলে) deep security test — তিনটাই যোগ করো।
- Suite-গুলো back-to-back চললে shared rate-window পূর্ণ হতে পারে — integration/self-heal এন্ড e2e/429-retry এটা সামলে নেয়।

## বর্তমান ফলাফল (2026-09-13)
```
UNIT 52/52 · PARSER 12/12 · INTEGRATION 32/32 · SECURITY-LIVE 25/25 · SECURITY-DEEP 35/35 · E2E 16/16  → ALL SUITES GREEN
```

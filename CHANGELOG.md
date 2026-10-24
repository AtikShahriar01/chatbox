# Changelog

All notable changes to Chatbox are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-10-24

The "agent intelligence" release: the chat client becomes a full ZCode-class
autonomous workspace. 7 feature areas, ~30 files touched, all suites green
(64 offline + 108 live security checks).

### Added
- **Image generation** — DALL·E 3 / GPT Image 1 through a new guarded
  `/api/image` proxy (OpenAI-compatible `/images/generations`), rendered
  inline in chat. Previously a dead button.
- **Document chat (RAG-lite)** — attach PDF/TXT/CSV/code files; a new
  `/api/document` route chunks, embeds (via the user's own provider) and
  retrieves relevant excerpts per question. Server-side vector cache with LRU
  eviction.
- **Agent vision** — `screenshot` (PowerShell + System.Drawing capture) and
  `see_image` (workspace image files) attach images as vision content parts,
  so the agent can *look* at the screen and at assets it created.
- **URL reader** — `read_url` fetches public pages as text with the same
  manual-redirect SSRF guard as downloads.
- **HTML artifacts** — `show_html` renders agent-written HTML in the IDE
  Preview pane through a new sandboxed `/api/pc/html` route (opaque origin,
  per-frame CSP).
- **Message branching** — regenerate keeps every reply version; browsable
  via ‹ x/n › switchers (`carryVariants`/`setMessageVariant`).
- **Context compaction** — overflowed conversation prefixes are summarized
  once and cached per chat instead of being silently dropped.
- **Auto-memory** — every ~8 messages, durable facts are extracted into the
  existing long-term memory (toggle in Settings → Chat).
- **Parallel agent teams** — CEO → workers orchestration fans out 2–4
  concurrent agents (Settings → Chat → Parallel agents; 1 = sequential).
- **Background task queue** — IDE agent panel gains a queue: goals auto-start
  when the agent is idle; completion fires unread badges/notifications.
- **Always-on scheduler** — schedules are mirrored to the bridge
  (`/schedules/set`); the bridge ticks every 30 s and runs automations even
  with the browser closed, storing results in `agent-bridge/automation-runs/`
  (visible in the Console dashboard). Browser-side scheduler stays as the
  interactive path.
- **Skills system** — user-defined stack rules injected into the CEO plan
  prompt and the autonomous agent system prompt (Settings → Skills).
- **ask_user tool** — the agent can ask the user a clarifying question
  mid-task (floating question card, option buttons + free text).
- **PTY terminal** — real ConPTY sessions via `@lydell/node-pty` (prebuilt,
  optional dep): arrow keys, history, colors. Line-mode terminals remain as
  fallback; all security gates (confine, command policy, approval, audit)
  apply to the new `/pty/*` routes.
- **IndexedDB image storage** — attached/generated images move out of
  localStorage (quota-safe) into IndexedDB with a one-time migration,
  content-addressed dedupe and a `SmartImage` resolver; exports inline the
  blobs.
- **Auto-backup** — daily full-store snapshots (API key masked) to
  `agent-bridge/backups/` (last 7 kept) via the bridge; manual "Backup now"
  in Settings → Data.
- **Web-search resilience** — 3-engine fallback chain (DDG HTML → DDG Lite →
  Wikipedia API) plus a 1-hour cache for searches and page text.
- **PDF preview** in the Agent Activity popup.

### Fixed
- Fallback-model `ReferenceError` crash in the chat streaming path.
- Anthropic/Google/Cohere non-streaming requests always forced `stream: true`,
  breaking `callModel` (agent engine, classifiers) on those providers —
  `/api/chat` now returns uniform OpenAI-shaped JSON for `stream: false`.
- Agent-engine step history was clobbered by a stale snapshot on every step.
- `/api/pc/stream` killed terminal/process SSE after 10 s (connect timeout
  applied to the whole body).
- Tool-action regex failed on JSON containing `}` inside string values.
- Per-chat cumulative token counters never accumulated (`lastUsage` was never
  set).
- Token estimation ignored Bengali/Indic scripts (≈2 chars/token now).
- Budget-exceeded flow no longer creates a fresh chat and loses context —
  the block is surfaced in the current chat.
- Console deep links (`/console/tasks`, …) open the right section; the URL
  tracks the active section.
- Data export now includes memory, prompt library, skills, drafts, custom
  models (and inline image blobs).

### Changed
- CI: lint step (eslint + next/core-web-vitals) added; a windows-latest job
  boots app + bridge and runs the FULL 108-check live security suite
  (report-only while it settles).
- Dependencies: removed unused `cmdk`, `docx`, `exceljs`, `pptxgenjs`,
  `react-dropzone`, `diff`; added `remark-math`, `rehype-katex`, `katex`,
  `mermaid` (lazy), `pdf-parse`; agent-bridge gains `@lydell/node-pty`
  (prebuilt, optional).
- KaTeX math and Mermaid diagram rendering in chat markdown (sanitize-first
  pipeline preserved).

## [1.1.0] — 2026-09
- Docs & visual overhaul: animated banner, live-tour demo GIF, mermaid
  architecture/security diagrams, §20 docs-vs-code audit sync.

## [1.0.0] — 2026-08
- Initial public release: local-first BYOK chat client, integrated IDE,
  autonomous PC agent over a guarded local bridge, 5-layer security model,
  172-check self-test pyramid.

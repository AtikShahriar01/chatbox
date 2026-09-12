# Chatbox IDE — Browser AI Coding Environment (v2)

আপনার Chatbox অ্যাপ এখন একটা **সম্পূর্ণ browser-based AI coding IDE** — ZCode-স্টাইল workflow সহ:
chat + code editor + terminal + git + autonomous agent + live preview — সব ব্রাউজার থেকে।

**Specs implemented:** [MASTER_PROMPT.md](../MASTER_PROMPT.md) + `docs/SPEC-1-PRD.txt`,
`docs/SPEC-2-TRD.txt`, `docs/SPEC-3-UIUX.txt`, `docs/SPEC-4-DATABASE.txt`,
`docs/SPEC-5-PREMIUM-UIUX.txt` (copied from H:\*_*.txt). Plan & status: [ROADMAP.md](../ROADMAP.md).

## দুটো ইন্টারফেস

| Route | কী | স্পেক |
|---|---|---|
| `/` | AI চ্যাট (existing, সম্পূর্ণ সংরক্ষিত) | spec-3 |
| `/ide` | ফুল IDE workspace (explorer, Monaco, xterm, git, preview, agent) | master, spec-3 |
| `/console` | **Premium dashboard shell** — Dashboard / Tasks / Agent / Security / Usage | spec-5 |
| `/console/tasks` | টাস্ক পেজ — Active/Completed/Failed/Cancelled tabs | spec-5 §TASKS |
| `/console/agent` | এজেন্ট ম্যানেজমেন্ট — device, modes, approvals, live activity | spec-5 §AGENT STATUS |
| `/console/security` | Permission center + emergency stop + audit log | spec-5 §PERMISSION CENTER |
| `/console/usage` | ব্যবহার/খরচ (৳/USDT) — existing TokenUsage | spec-5 §USAGE |
| `/login` | লোকাল PIN একাউন্ট (SHA-256+salt, localStorage) | spec-5 §AUTH |

**Design system (spec-5):** `globals.css`-এ centralized semantic tokens (`--bg`, `--panel-bg`,
`--txt`, `--accent`, `--ok/--warn/--err`, motion 140–220ms, reduced-motion support) — সব
IDE/console কম্পোনেন্ট এই টোকেন ব্যবহার করে, তিনটা থিম + light/dark-এ অটো মানিয়ে নেয়।

---

## Quick start

```bash
# 1) bridge চালু করুন (Local PC Agent) — অথবা start-app.bat ব্যবহার করুন
node "H:\chatbot create\agent-bridge\server.js"

# 2) web app চালু করুন
cd "H:\chatbot create\app"
npx next start -p 3000        # বা dev: npx next dev

# 3) ব্রাউজারে
http://localhost:3000/console # premium dashboard (spec-5)
http://localhost:3000/ide     # IDE workspace
http://localhost:3000/        # chat (sidebar → "Open IDE")
http://localhost:3000/login   # local PIN account (ঐচ্ছিক)
```

প্রথমবার: Settings → Model Provider-এ API base + key দিন (BYOK — কী ব্রাউজারেই থাকে)।

## কী কী আছে (feature audit — master §66)

| ✓ | Feature | কোথায় |
|---|---|---|
| ✅ | Browser AI Chat | `/` — existing, preserved |
| ✅ | Local PC Agent (bridge v2) | `agent-bridge/server.js` — proc/term/git/checkpoint/SSE/audit |
| ✅ | PC Access + status | IDE top bar + Agent panel (connected/mode/workspace) |
| ✅ | Project Access (workspace confinement) | bridge `confine()` — workspace-এর বাইরে সব ব্লক |
| ✅ | Full Access Mode | Agent panel → ask/safe/Full Access |
| ✅ | File Explorer | `FileExplorer.js` — tree, create/rename/delete, context menu |
| ✅ | Code Editor | `EditorTabs.js` — Monaco (local `/monaco-vscode`, offline), tabs, diff, Ctrl+S |
| ✅ | Terminal | `TerminalPane.js` — xterm.js, multi-session, SSE streaming, Ctrl+C |
| ✅ | Process Manager | bottom → Processes (list/stop/port detect) |
| ✅ | Build/Test/Auto-debug | agent engine validates changes, retries up to 3× |
| ✅ | Git | bottom → Git (status/diff/log/branch/stage/commit) |
| ✅ | Checkpoints + Rollback | bridge (`/checkpoint/*`) — git commit বা file-snapshot |
| ✅ | Live Preview | `PreviewPane.js` — port auto-detect + iframe |
| ✅ | Project Intelligence + Dashboard | `/project/inspect` + `DashboardPanel.js` (health + tips) |
| ✅ | Code Search | bridge `/grep` (regex) + `/search/files` |
| ✅ | AI Tool Calling (28 tools) | `agent-tools.js` — validated registry |
| ✅ | Autonomous Tasks | `agent-engine.js` — plan→tool→observe loop, max 30 steps |
| ✅ | Task Manager + Activity Stream | Agent panel (steps/commands/files live) + Output tab |
| ✅ | Approvals | ask/safe mode → inline approval modal (Allow once/all/deny) |
| ✅ | Usage Tracking | existing token/৳/USDT system, agent calls included |
| ✅ | Secret Protection | `.env`/key redaction in outputs, credential-store command denylist, guarded `agent-bridge/` zone |
| ✅ | Audit Logs | `agent-bridge/audit.log` + IDE Activity Log tab |
| ✅ | Keyboard shortcuts | Ctrl+K/Shift+P palette, Ctrl+B/`/S/Enter… (IDE) |
| ✅ | Stop/Pause/Resume/Retry | Agent console controls |
| ✅ | Premium dashboard shell | `/console` — sidebar, status pill, cards, quick actions |
| ✅ | Approval flow (Allow once / for task / all / deny) | IDE Agent panel + Agent page |
| ✅ | AI Changes review (accept/reject/revert) | IDE → Changes tab |
| ✅ | Empty/Error/Loading states | `components/platform/States.js` |
| ✅ | Agent status 8-state pill | ONLINE/BUSY/WAITING/PAUSED/RECONNECTING/… |

## Security model (TRD §20 মেনে)

- **AI হলো untrusted input** — প্রতিটা tool call ব্রিজে যাওয়ার আগে registry-তে validate হয়
- **Workspace confinement** — সব ফাইল/কমান্ড অপ workspace-এর ভেতরে সীমাবদ্ধ (default: `H:\chatbot create`)
- **Guarded zone** — `agent-bridge/` ফোল্ডার (token, audit, checkpoints) কেউ read/write/delete করতে পারে না
- **Command policy** — `.ssh`, private keys, browser credential stores, LSASS ইত্যাদি ব্লকড
- **Secret redaction** — command output-এ `sk-…`, `Bearer …`, `api_key…`, PEM keys মুছে যায়
- **Token auth** — bridge token শুধু server-side (`/api/pc` proxy); SSE-তে query-param token কিন্তু localhost-only
- **Audit** — প্রতিটা অপ `audit.log`-এ append-only

## Testing

```bash
bash "H:\chatbot create\scripts\test-bridge.sh"   # 37/37 pass
```

## Known limits (honest)

- Terminal PTY নেই (line-mode + লোকাল echo); interactive TUI প্রোগ্রাম এখন যাবে না
- Multi-user/DB (PRD §38 SQL schema) এখনো নেই — single-user, local-first ডিজাইন
- GitHub push/PR এখনো exec (`git push`) দিয়ে — token UI-তে ধরা হয় না
- Bridge HTTP (TLS নেই) — same-machine transport, লোকাল ব্যবহারের জন্য ঠিক

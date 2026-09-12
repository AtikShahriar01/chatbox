# Chatbox — A Local-First, Multi-Model AI Chat Client

A private, all-in-one AI workspace that runs entirely on your own PC: chat with any
model provider, a built-in code IDE with a live terminal, and an autonomous coding
agent that acts on your machine — with production-grade security hardening. No cloud
account, no data leaving your computer.

---

## Features

- **Multi-Model Chat**: OpenAI, Claude, Gemini, DeepSeek, Groq, Mistral, xAI, Cohere, OpenRouter, Ollama, LM Studio — bring your own key (BYOK), stream responses live.
- **Built-in IDE**: Monaco editor, file explorer, persistent terminal sessions, git integration, and a live project dashboard — all inside the browser.
- **Autonomous Coding Agent**: Give it a big task and watch a live to-do checklist tick off as it plans, writes files, runs commands, and self-verifies.
- **PC Agent with Guardrails**: File/command access is confined to your chosen workspace, with an exec denylist, secret redaction, approval modes, and a full audit log.
- **Local-First & Private**: The server binds to localhost (or your LAN only). Everything — chats, keys, sessions, caches — stays inside one folder. Nothing touches C: or the cloud.
- **Cost & Usage Tracking**: Per-model token counts, USD/BDT cost, internal "usage value", monthly budget warnings.
- **Portable Toolchain**: Ships its own Node.js and Python. Copy the folder to any Windows PC and run.

---

## Why Use Chatbox?

- **Privacy by default** — your API keys and conversations never leave your machine.
- **One folder, zero setup** — no installers; double-click a `.bat` and it runs.
- **Security-first** — 5-layer defense-in-depth (network binding, origin/CSRF gates, server-side session auth, API guards, sandboxed PC bridge).
- **Real tooling** — not just a chat UI: an actual IDE + agent that edits files and runs code on your PC, with checkpoints for rollback.

---

## Getting Started

### Prerequisites

- Windows 10/11 (the launchers are `.bat`; the toolchain is Windows-portable)
- No other software needed — Node.js and Python are bundled in `tools/` and `.home/`

### Installation

1. **Clone or copy the folder** to any location (e.g. `D:\chatbox`):

   ```bash
   git clone https://github.com/AtikShahriar01/chatbox.git
   ```

2. **Start the app** — double-click one of:

   | File | What it does |
   |---|---|
   | `start-app.bat` | Daily use — localhost only (most secure) |
   | `start-server.bat` | LAN mode — open from your phone via `http://<PC-IP>:3000` |
   | `start-dev.bat` | Development with hot reload |

   On first run it auto-installs dependencies and builds the production bundle.

3. **Open** http://localhost:3000 in your browser.

4. **Create your PIN** on the login screen (server-side verified; 5 wrong tries → 5-min lock).

5. **Add an API key** — Settings → Model Provider → paste your key (OpenRouter, OpenAI, etc.) or point the base URL at a local Ollama server (`http://localhost:11434/v1`, no key needed).

---

## Configuration Guide

### Model Provider

Set the **API Base URL**, **API Key**, and **Model** in Settings → Model Provider.
The app auto-detects the provider protocol (OpenAI / Anthropic / Google / Cohere / Ollama)
from the base URL and routes accordingly.

### PC Agent & Workspace

Open the IDE → **Change project folder** to pick the workspace. The agent can only
read/write/run inside that folder. Choose a permission mode in PC Access:

- **Ask** — every write/command needs your approval
- **Safe** — reads auto, writes/commands ask
- **Full Access** — everything automatic (use with care)

### Portability

Every script self-locates, so the folder works from any drive. Nothing is hardcoded to
`H:`. To start fresh on a new machine, delete the `.auth/` folder (your PIN) and re-register.

---

## Project Structure

```
chatbox/
├── app/                # Next.js app — pages, API routes, components, lib
│   ├── app/            # routes: chat, ide, console, login + /api/*
│   ├── components/     # UI (ChatPanel, IDE, TodoPanel, …)
│   └── lib/            # state, providers, agent engine, security guard
├── agent-bridge/       # local PC bridge server (files, exec, git, terminals)
├── docs/               # security, audit, PRD/TRD/UIUX specs
├── .selftest/          # parser + live security test suites
├── scripts/            # check-env.sh
├── tools/  .home/      # bundled portable Node.js + Python (gitignored)
├── start-*.bat         # launchers
└── clean-cache.bat     # one-click cache/log cleanup
```

---

## Security

Chatbox is built around defense-in-depth. See **[SECURITY.md](SECURITY.md)** and the
full audit in **[docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)**.

- **Network**: server binds to localhost (or LAN in `start-server.bat`); Host allowlist blocks DNS rebinding.
- **Auth**: server-side session (HttpOnly, SameSite=Strict, HMAC-signed cookie); PIN verified server-side.
- **API**: same-origin + custom-header checks, per-route rate limits, body-size caps, strict bridge op-whitelist.
- **PC bridge**: token never reaches the browser; path confinement, credential denylist, output secret-redaction, and a full audit log.
- **Content**: AI output is markdown-sanitized and locked down by a strict Content-Security-Policy.

---

## Testing

```bash
# SSE parser unit tests
node .selftest/parser-tests.mjs

# 25 live security tests (server + bridge running)
node .selftest/security-live-tests.mjs

# verify all data stays inside the folder
bash scripts/check-env.sh
```

CI runs the build + parser tests on every push (see `.github/workflows/ci.yml`).

---

## Contributing

Issues and pull requests are welcome. For security-sensitive changes, follow
[docs/SECURITY-DIRECTIVE.md](docs/SECURITY-DIRECTIVE.md) and run the security test
suite before opening a PR.

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE).

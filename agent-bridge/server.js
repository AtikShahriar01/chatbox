// Chatbox PC Bridge v2 — gives the Chatbox web IDE controlled access to this PC.
// Runs on localhost only, token-protected, with an explicit permission mode:
//   "ask"    → every non-read operation waits for user approval in the app
//   "safe"   → read/list/status ops run automatically; writes/exec need approval
//   "auto"   → everything runs automatically (user opted in)
// Every action is appended to agent-bridge/audit.log.
//
// v2 adds (ZCode-style IDE support):
//   - process manager (/proc/*)      start/list/stop long-running commands, port detection
//   - terminal sessions (/term/*)    persistent shells, streamed output
//   - SSE streaming (/stream/:id)    live output for terminals & processes
//   - git visibility (/git/*)        status/diff/log/branch/checkout
//   - checkpoints (/checkpoint/*)    commit-based (git) or file-snapshot rollback
//   - project intelligence (/project/inspect)
//   - sysinfo (/sysinfo), filename search (/search/files)
//   - secret redaction in command output, exec denylist for credential stores
//   - default workspace = this folder's parent (never touches other drives)

const http = require("http");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const media = require("./media.js");
media.init({ confine, audit, runCommand });

const PORT = 8765;
const APP_ORIGIN = "http://localhost:3000";
const ROOT = __dirname;
const DEFAULT_WS = path.resolve(ROOT, ".."); // H:\chatbot create
const IS_WIN = process.platform === "win32";
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".agent-checkpoints", ".npm", ".home", ".tmp", "__pycache__", ".venv", "venv", "agent-bridge", "checkpoints", ".agent-selftest"]);

// ------------------------------------------------------------------ token ---
const TOKEN_FILE = path.join(ROOT, "bridge-token.txt");
function ensureToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    const t = crypto.randomBytes(24).toString("hex");
    fs.writeFileSync(TOKEN_FILE, t, { encoding: "utf8" });
    return t;
  }
}
const TOKEN = ensureToken();

// --------------------------------------------------------- mode + workspace --
const MODE_FILE = path.join(ROOT, "bridge-mode.txt");
function readMode() {
  try { return fs.readFileSync(MODE_FILE, "utf8").trim() || "ask"; } catch { return "ask"; }
}
function writeMode(m) { fs.writeFileSync(MODE_FILE, m, "utf8"); }

const WS_FILE = path.join(ROOT, "bridge-workspace.txt");
function readWorkspace() {
  try {
    const p = fs.readFileSync(WS_FILE, "utf8").trim() || null;
    // Portability: if the whole folder was moved to another PC/drive, the old
    // absolute workspace path no longer exists — fall back to the NEW default
    // instead of erroring on every file op.
    if (p && fs.existsSync(p)) return p;
    return null;
  } catch { return null; }
}
function writeWorkspace(p) {
  if (!p) { try { fs.unlinkSync(WS_FILE); } catch {} return; }
  fs.writeFileSync(WS_FILE, path.resolve(p), "utf8");
}
// Effective workspace: explicit setting, else the project root. All file ops
// are confined inside it — the browser can never wander the whole PC.
function effectiveWorkspace() { return readWorkspace() || DEFAULT_WS; }

function confine(p) {
  const ws = effectiveWorkspace();
  const rel = path.relative(ws, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Outside workspace (${ws}). Set a different workspace or clear it.` };
  }
  const g = guardedReason(p);
  if (g) return { ok: false, error: g };
  return { ok: true, path: p };
}

// Guarded zone: the bridge's own home (token, audit log, checkpoints) must
// never be readable/writable/deletable through file tools (TRD §9).
const CP_DIR = path.join(ROOT, "checkpoints");
function guardedReason(p) {
  const rel = path.relative(ROOT, p);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return "agent-bridge folder is protected (token/audit/checkpoints)";
  return null;
}

// ------------------------------------------------------------------- audit ---
const LOG_FILE = path.join(ROOT, "audit.log");
function audit(kind, detail, extra = "") {
  const line = `[${new Date().toISOString()}] ${kind} ${detail} ${extra}\n`;
  fs.appendFile(LOG_FILE, line, () => {});
}

// ----------------------------------------------------------------- helpers ---
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => { buf += c; if (buf.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
  });
}

function resolvePath(p) {
  if (!p) return null;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

// Redact accidental secrets in COMMAND OUTPUT (never in file reads — the
// editor needs real content). Same patterns as the app's /api/chat scrubber.
function redact(text) {
  if (!text) return text;
  return String(text)
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/g, "sk-***REDACTED***")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]{8,}/gi, "Bearer ***REDACTED***")
    .replace(/("?(?:api[_-]?key|api[_-]?token|access[_-]?token|secret)"?\s*[:=]\s*")([^"]{6,})(")/gi, "$1***REDACTED***$3")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "***PRIVATE KEY REDACTED***");
}

// Command policy: refuse commands that touch credential stores / private keys.
const DENY_PATTERNS = [
  /id_rsa/i, /id_ed25519/i, /id_ecdsa/i, /[\\\/]\.ssh([\\\/\s]|$)/i,
  /[\\\/]User Data[\\\/].*(Cookies|Login Data|Web Data)/i,
  /lsass/i, /[\\\/]Windows[\\\/]System32[\\\/]config[\\\/]sam/i,
  /secrets?\.json/i, /credentials?\.json/i,
  /\b(type|cat|more|Get-Content)\b[^&|>]*[\\\/"]\.env\b/i,
];
function commandPolicy(cmd) {
  for (const re of DENY_PATTERNS) {
    if (re.test(cmd)) return `blocked by command policy (matched ${re})`;
  }
  return null;
}

// Run a shell command to completion.
function runCommand(cmd, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    execFile(IS_WIN ? "cmd" : "sh", IS_WIN ? ["/c", cmd] : ["-c", cmd], {
      cwd: cwd || undefined,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        exitCode: err ? (err.code ?? 1) : 0,
        stdout: redact(String(stdout || "").slice(0, 60000)),
        stderr: redact(String(stderr || err?.message || "").slice(0, 20000)),
      });
    });
  });
}

// Run git with an args ARRAY — bypasses cmd.exe's unreliable quote handling
// (a quoted -m message through `cmd /c` gets mangled and breaks commits).
function gitExec(args, cwd) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, exitCode: err ? (err.code ?? 1) : 0, stdout: String(stdout || ""), stderr: String(stderr || err?.message || "") });
    });
  });
}

// Run a git subcommand inside the workspace (or the given repo dir).
// Accepts an array of args (preferred) or a plain string split on spaces.
function git(args, cwd) {
  const dir = cwd ? resolvePath(cwd) : effectiveWorkspace();
  const c = confine(dir);
  if (!c.ok) return Promise.resolve({ ok: false, error: c.error });
  const argv = Array.isArray(args) ? args : String(args).split(/\s+/).filter(Boolean);
  return gitExec(argv, c.path).then((r) => ({ ...r, cwd: c.path }));
}

// ------------------------------------------------------------ output buffers --
// Shared store for process/terminal output. Each session keeps a chunk list
// (byte-offset addressed) so clients can poll incrementally or attach SSE.
const outputs = new Map(); // id → { chunks: [{offset, text}], total, listeners: Set, closed }
function outInit(id) {
  outputs.set(id, { chunks: [], total: 0, listeners: new Set(), closed: false });
}
function outPush(id, text) {
  const o = outputs.get(id);
  if (!o) return;
  text = String(text);
  o.total += text.length;
  o.chunks.push({ offset: o.total - text.length, text });
  // ring cap: drop oldest beyond 300KB
  if (o.chunks.length > 4000 || o.total > 3e5) {
    let acc = 0, cut = 0;
    for (let i = o.chunks.length - 1; i >= 0; i--) { acc += o.chunks[i].text.length; if (acc > 3e5) { cut = i; break; } }
    if (cut > 0) { o.chunks = o.chunks.slice(cut); o.base = o.total - acc; }
  }
  for (const fn of o.listeners) { try { fn(text); } catch {} }
}
function outSince(id, since = 0) {
  const o = outputs.get(id);
  if (!o) return { ok: false, error: "no such stream" };
  if (since <= (o.base || 0)) return { ok: true, offset: o.total, new: o.chunks.map((c) => c.text).join(""), total: o.total, closed: o.closed };
  const parts = [];
  for (const c of o.chunks) {
    if (c.offset + c.text.length <= since) continue;
    parts.push(c.offset < since ? c.text.slice(since - c.offset) : c.text);
  }
  return { ok: true, offset: o.total, new: parts.join(""), total: o.total, closed: o.closed };
}

// ------------------------------------------------------- process manager -----
const procs = new Map(); // id → proc entry
let procSeq = 1;

function detectPort(text) {
  const m = String(text).match(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::)[:\s]+(\d{2,5})/i)
    || String(text).match(/(?:port|listening on)[^\d]{0,12}(\d{2,5})/i);
  return m ? Number(m[1]) : null;
}

function procStart(cmd, cwd) {
  const dir = cwd ? resolvePath(cwd) : effectiveWorkspace();
  const c = confine(dir);
  if (!c.ok) return { ok: false, error: c.error };
  const policy = commandPolicy(cmd);
  if (policy) { audit("BLOCK", cmd.slice(0, 120), policy); return { ok: false, error: policy }; }
  const id = "p" + Date.now().toString(36) + (procSeq++);
  outInit(id);
  const entry = { id, cmd, cwd: c.path, pid: null, status: "starting", startedAt: new Date().toISOString(), port: null, exitCode: null };
  try {
    const child = IS_WIN
      ? spawn("cmd", ["/c", cmd], { cwd: c.path, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0" } })
      : spawn("sh", ["-c", cmd], { cwd: c.path, env: { ...process.env, FORCE_COLOR: "0" } });
    entry.pid = child.pid;
    entry.proc = child;
    entry.status = "running";
    const onData = (buf, chan) => {
      const text = buf.toString("utf8");
      outPush(id, text);
      if (!entry.port) { const p = detectPort(text); if (p) { entry.port = p; outPush(id, `\n[bridge] detected server port ${p}\n`); } }
    };
    child.stdout.on("data", (b) => onData(b, "out"));
    child.stderr.on("data", (b) => onData(b, "err"));
    child.on("exit", (code, sig) => {
      entry.status = code === 0 ? "exited" : "failed";
      entry.exitCode = code ?? (sig ? 1 : 0);
      outPush(id, `\n[bridge] process ${code === 0 ? "exited" : "failed"} (code ${code ?? sig})\n`);
      const o = outputs.get(id); if (o) { o.closed = true; }
    });
    child.on("error", (e) => { entry.status = "failed"; outPush(id, `\n[bridge] spawn error: ${e.message}\n`); });
  } catch (e) { return { ok: false, error: String(e.message) }; }
  procs.set(id, entry);
  if (procs.size > 24) { // reap oldest finished entries
    for (const [k, v] of procs) { if (procs.size <= 20) break; if (v.status !== "running") procs.delete(k); }
  }
  audit("PROC_START", cmd.slice(0, 160), `pid=${entry.pid}`);
  return { ok: true, ...serializeProc(entry) };
}
function serializeProc(p) {
  return { id: p.id, cmd: p.cmd, cwd: p.cwd, pid: p.pid, status: p.status, startedAt: p.startedAt, port: p.port, exitCode: p.exitCode };
}
function procStop(id) {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "no such process" };
  audit("PROC_STOP", `${p.cmd.slice(0, 120)} pid=${p.pid}`);
  return new Promise((resolve) => {
    if (IS_WIN) {
      execFile("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }, () => {
        p.status = "stopped"; resolve({ ok: true, id, pid: p.pid });
      });
    } else {
      try { process.kill(-p.pid, "SIGTERM"); } catch { try { p.proc.kill("SIGKILL"); } catch {} }
      p.status = "stopped"; resolve({ ok: true, id, pid: p.pid });
    }
  });
}

// ------------------------------------------------------- terminal sessions ---
const terms = new Map(); // id → { id, shell, cwd }
let termSeq = 1;
function termCreate(cwd, shell = "cmd") {
  const dir = cwd ? resolvePath(cwd) : effectiveWorkspace();
  const c = confine(dir);
  if (!c.ok) return { ok: false, error: c.error };
  if (terms.size >= 10) return { ok: false, error: "max 10 terminal sessions (kill one first)" };
  const usePs = String(shell).toLowerCase() === "powershell";
  const id = "t" + Date.now().toString(36) + (termSeq++);
  outInit(id);
  const spawnCmd = usePs ? "powershell" : "cmd";
  const spawnArgs = usePs ? ["-NoProfile", "-ExecutionPolicy", "Bypass"] : [];
  const child = spawn(spawnCmd, spawnArgs, { cwd: c.path, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", PROMPT: "$P$G" } });
  child.stdout.on("data", (b) => outPush(id, b.toString("utf8")));
  child.stderr.on("data", (b) => outPush(id, b.toString("utf8")));
  child.on("exit", () => { const o = outputs.get(id); if (o) o.closed = true; terms.delete(id); });
  terms.set(id, { id, shell: child, cwd: c.path, kind: usePs ? "powershell" : "cmd" });
  audit("TERM_NEW", `${usePs ? "powershell" : "cmd"} @ ${c.path}`);
  return { ok: true, id, cwd: c.path, shell: usePs ? "powershell" : "cmd" };
}
function termWrite(id, input) {
  const t = terms.get(id);
  if (!t) return { ok: false, error: "no such terminal" };
  const policy = commandPolicy(String(input));
  if (policy) { audit("BLOCK", String(input).slice(0, 120), policy); return { ok: false, error: policy }; }
  audit("TERM_IN", String(input).slice(0, 160));
  t.shell.stdin.write(String(input).endsWith("\n") ? input : input + "\n");
  return { ok: true };
}
function termKill(id) {
  const t = terms.get(id);
  if (!t) return { ok: false, error: "no such terminal" };
  audit("TERM_KILL", id);
  try { IS_WIN ? t.shell.kill() : process.kill(-t.shell.pid); } catch { try { t.shell.kill("SIGKILL"); } catch {} }
  terms.delete(id);
  return { ok: true };
}

// ------------------------------------------------------------- checkpoints ---
// Snapshot-based checkpoints (work with or without git) + git commit for repos.
function cpIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(CP_DIR, "index.json"), "utf8")); } catch { return []; }
}
function cpSaveIndex(list) {
  fs.mkdirSync(CP_DIR, { recursive: true });
  fs.writeFileSync(path.join(CP_DIR, "index.json"), JSON.stringify(list, null, 2), "utf8");
}
function walkFiles(dir, base, out, budget) {
  if (budget.count >= 4000 || budget.bytes >= 60e6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, base, out, budget);
    else {
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (st.size > 2e6) continue;
      out.push({ abs: full, rel: path.relative(base, full).split(path.sep).join("/"), size: st.size });
      budget.count++; budget.bytes += st.size;
    }
  }
}
async function checkpointCreate(label, cwd) {
  const ws = cwd ? resolvePath(cwd) : effectiveWorkspace();
  const c = confine(ws);
  if (!c.ok) return { ok: false, error: c.error };
  const id = "cp" + Date.now().toString(36);
  const meta = { id, label: label || "checkpoint", at: new Date().toISOString(), workspace: c.path, mode: null, hash: null, files: 0 };
  const isGit = fs.existsSync(path.join(c.path, ".git"));
  if (isGit) {
    await gitExec(["add", "-A"], c.path);
    const cm = await gitExec(["commit", "-m", `checkpoint: ${String(label || "auto").slice(0, 60)}`, "--allow-empty"], c.path);
    const rev = await gitExec(["rev-parse", "HEAD"], c.path);
    meta.mode = "git";
    meta.hash = (rev.stdout || "").trim();
    meta.note = cm.ok ? "git commit created" : "git commit: " + (cm.stderr || "").slice(0, 200);
    if (!rev.ok) return { ok: false, error: "git rev-parse failed: " + (rev.stderr || "").slice(0, 200) };
  } else {
    // Full file snapshot (small workspaces only — 60MB budget, 2MB/file cap)
    const dir = path.join(CP_DIR, id);
    const files = []; const budget = { count: 0, bytes: 0 };
    walkFiles(c.path, c.path, files, budget);
    for (const f of files) {
      const dest = path.join(dir, "files", f.rel);
      try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(f.abs, dest); } catch {}
    }
    meta.mode = "snapshot";
    meta.files = files.length;
    meta.note = `snapshot: ${files.length} files (${(budget.bytes / 1e6).toFixed(1)} MB)`;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ workspace: c.path, files: files.map((f) => f.rel) }, null, 2), "utf8");
  }
  const list = cpIndex(); list.unshift(meta); cpSaveIndex(list.slice(0, 50));
  audit("CHECKPOINT", `${meta.mode} ${meta.hash || meta.files}`, c.path);
  return { ok: true, ...meta };
}
async function checkpointRollback(id, opts = {}) {
  const list = cpIndex();
  const meta = list.find((m) => m.id === id);
  if (!meta) return { ok: false, error: "no such checkpoint" };
  let result;
  if (meta.mode === "git") {
    result = await gitExec(["reset", "--hard", meta.hash], meta.workspace);
    if (result.ok) {
      const clean = await gitExec(["clean", "-fd"], meta.workspace);
      result.note = "reset --hard + clean -fd done" + (clean.stderr ? ` (clean: ${(clean.stderr || "").slice(0, 120)})` : "");
    } else {
      result.note = (result.stderr || "").slice(0, 200);
    }
  } else {
    const snap = path.join(CP_DIR, id);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(snap, "manifest.json"), "utf8")); }
    catch { return { ok: false, error: "checkpoint manifest missing" }; }
    const keep = new Set(manifest.files);
    // 1) restore every snapshotted file FIRST (so nothing can destroy the snapshot)
    let restored = 0;
    for (const rel of keep) {
      const src = path.join(snap, "files", rel);
      const dest = path.join(meta.workspace, rel);
      try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); restored++; } catch {}
    }
    // 2) delete files created after the checkpoint (not in manifest, not ignored dirs) — opt-out via deleteNew:false
    if (opts.deleteNew !== false) {
      const now = []; const budget = { count: 0, bytes: 0 };
      walkFiles(meta.workspace, meta.workspace, now, budget);
      let deleted = 0;
      for (const f of now) {
        if (!keep.has(f.rel)) { try { fs.unlinkSync(f.abs); deleted++; } catch {} }
      }
      result = { ok: true, note: `restored ${restored} files, deleted ${deleted} newer files` };
    } else {
      result = { ok: true, note: `restored ${restored} files (newer files kept)` };
    }
  }
  audit("ROLLBACK", id, result.ok ? "ok" : "error");
  return { ...result, id };
}

// ---------------------------------------------------------- office / media ---
// Document & audio generation. Runs in the BRIDGE so heavy libs stay off the
// web app and files land directly in the workspace. All paths confined.
async function makeOffice(kind, body) {
  const p = resolvePath(body.path);
  if (!p) return { ok: false, error: "missing path" };
  const c = confine(p);
  if (!c.ok) return c;
  audit("OFFICE", `${kind} → ${c.path}`);
  try {
    fs.mkdirSync(path.dirname(c.path), { recursive: true });
    const appRoot = path.join(DEFAULT_WS, "app", "node_modules");
    // require from the app's node_modules without chdir
    const req = (name) => require(path.join(appRoot, name));

    if (kind === "docx") {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = req("docx");
      const paras = String(body.content || "Empty document")
        .split("\n")
        .map((line) =>
          /^#\s+/.test(line)
            ? new Paragraph({ text: line.replace(/^#\s+/, ""), heading: HeadingLevel.HEADING_1 })
            : /^##\s+/.test(line)
              ? new Paragraph({ text: line.replace(/^##\s+/, ""), heading: HeadingLevel.HEADING_2 })
              : new Paragraph({ children: [new TextRun(line)] })
        );
      const doc = new Document({ sections: [{ children: paras }] });
      fs.writeFileSync(c.path, await Packer.toBuffer(doc));
      return { ok: true, path: c.path, bytes: fs.statSync(c.path).size };
    }

    if (kind === "xlsx") {
      const ExcelJS = req("exceljs");
      const wb = new ExcelJS.Workbook();
      // body.sheets: [{ name, rows: [[cell, ...], ...] }] or single sheet from content (CSV-ish)
      const sheets = Array.isArray(body.sheets) && body.sheets.length
        ? body.sheets
        : [{ name: "Sheet1", rows: String(body.content || "").split("\n").map((l) => l.split(/[,;\t]/).map((x) => x.trim())) }];
      for (const s of sheets.slice(0, 12)) {
        const ws = wb.addWorksheet(String(s.name || "Sheet").slice(0, 31));
        for (const row of (s.rows || []).slice(0, 5000)) ws.addRow(row.map((cell) => {
          const t = String(cell ?? "");
          const n = Number(t);
          return t !== "" && !isNaN(n) ? n : t;
        }));
      }
      await wb.xlsx.writeFile(c.path);
      return { ok: true, path: c.path, bytes: fs.statSync(c.path).size };
    }

    if (kind === "pptx") {
      const PptxGenJS = req("pptxgenjs");
      const pptx = new PptxGenJS();
      // body.slides: [{ title, bullets: [] }]
      const slides = Array.isArray(body.slides) && body.slides.length
        ? body.slides
        : String(body.content || "")
            .split(/\n\s*\n/)
            .slice(0, 40)
            .map((block) => {
              const lines = block.split("\n").map((l) => l.replace(/^#\s+/, "").trim()).filter(Boolean);
              return { title: lines[0] || "Slide", bullets: lines.slice(1) };
            });
      for (const s of slides) {
        const slide = pptx.addSlide();
        slide.addText(String(s.title || "Slide").slice(0, 120), { x: 0.5, y: 0.4, fontSize: 26, bold: true, color: "1F2937" });
        if (s.bullets?.length) slide.addText(s.bullets.slice(0, 12).map((b) => ({ text: String(b).slice(0, 200), options: { bullet: true, fontSize: 16, color: "374151" } })), { x: 0.7, y: 1.3, w: 8.5 });
      }
      await pptx.writeFile({ fileName: c.path });
      // Visual previews: render each slide as PNG (same layout, light theme)
      // so the popup can show the deck without PowerPoint installed.
      let previews = null;
      try { previews = await media.renderPptxPreviews(slides, c.path); } catch {}
      return { ok: true, path: c.path, bytes: fs.statSync(c.path).size, slides: slides.length, previews: previews ? previews.length : 0 };
    }

    return { ok: false, error: "unknown office kind" };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; }
}

// Text-to-speech via Windows SAPI (no cloud, no key). Bangla falls back to
// the default voice unless a bn voice is installed.
function makeAudio(body) {
  const p = resolvePath(body.path);
  if (!p) return { ok: false, error: "missing path" };
  const c = confine(p);
  if (!c.ok) return c;
  const text = String(body.text || "").slice(0, 8000);
  if (!text.trim()) return { ok: false, error: "missing text" };
  // Optional "voice" name — pick an installed Windows voice (voice cloning
  // stand-in: same script, different installed voices per speaker persona).
  const voice = String(body.voice || "").trim();
  audit("AUDIO", `tts → ${c.path} (${text.length} chars)${voice ? " voice=" + voice : ""}`);
  return new Promise((resolve) => {
    const safeText = text.replace(/\r/g, "");
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;` +
      (voice ? ` $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like '*${voice.replace(/'/g, "''")}*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };` : "") +
      ` $s.SetOutputToWaveFile('${String(c.path).replace(/'/g, "''")}'); $s.Speak(@'\n${safeText}\n'@); $s.Dispose();`;
    execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: String(err.message || stderr || "tts failed").slice(0, 300) });
      try { return resolve({ ok: true, path: c.path, bytes: fs.statSync(c.path).size }); }
      catch (e) { return resolve({ ok: false, error: String(e.message) }); }
    });
  });
}

// List installed TTS voices (so the agent/user can pick a "cloned" persona).
function listVoices() {
  return new Promise((resolve) => {
    const ps = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }`;
    execFile("powershell", ["-NoProfile", "-Command", ps], { timeout: 30000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: String(err.message).slice(0, 200) });
      return resolve({ ok: true, voices: String(stdout || "").split("\r\n").map((s) => s.trim()).filter(Boolean) });
    });
  });
}

// Audio edit ops via PowerShell + .NET Speech/WAV math (trim / concat / volume /
// speed). Works on the WAV files our TTS produces — no external deps.
function audioEdit(body) {
  const op = String(body.op || "").toLowerCase();
  const input = resolvePath(body.input);
  const output = resolvePath(body.output);
  if (!input || !output) return { ok: false, error: "missing input/output" };
  const c1 = confine(input); const c2 = confine(output);
  if (!c1.ok) return c1; if (!c2.ok) return c2;
  audit("AUDIO_EDIT", `${op} ${c1.path} → ${c2.path}`);

  const ps = { trim: null, concat: null, volume: null, speed: null };
  if (op === "trim") {
    const start = Number(body.startSec || 0), end = Number(body.endSec || 0);
    if (end <= start) return { ok: false, error: "endSec must be > startSec" };
    ps.trim = `Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]::new('${String(c1.path).replace(/'/g, "''")}')); Start-Sleep -Milliseconds 800; $len = $p.NaturalDuration.TimeSpan.TotalSeconds; Write-Output $len;`;
    // simpler & robust: use ffmpeg if present, else SAPI re-record is not possible → fallback to raw WAV copy slice via PS byte math
    return new Promise((resolve) => {
      // WAV header-aware trim with pure PowerShell (44-byte standard header assumed)
      const script = `
$in='${String(c1.path).replace(/'/g, "''")}'; $out='${String(c2.path).replace(/'/g, "''")}';
$bytes=[System.IO.File]::ReadAllBytes($in);
if($bytes.Length -le 44){ throw 'wav too small' };
# find data chunk
$idx=12; $dataOff=-1; $dataLen=0;
while($idx -lt $bytes.Length-8){ $id=[System.Text.Encoding]::ASCII.GetString($bytes,$idx,4); $sz=[BitConverter]::ToUInt32($bytes,$idx+4); if($id -eq 'data'){ $dataOff=$idx+8; $dataLen=$sz; break }; $idx+=8+$sz };
if($dataOff -lt 0){ throw 'no data chunk' };
$byteRate=[BitConverter]::ToUInt32($bytes,28);
$start=[double]'${Number(body.startSec || 0)}'; $end=[double]'${Number(body.endSec || 0)}';
$sOff=$dataOff+[int]([Math]::Max(0,$start)*$byteRate); $eOff=$dataOff+[int]([Math]::Min(999999,$end)*$byteRate);
$eOff=[Math]::Min($eOff,$dataOff+$dataLen);
if($eOff -le $sOff){ throw 'empty slice' };
$newLen=$eOff-$sOff;
$new=[byte[]]::new($newLen+44);
[Array]::Copy($bytes,0,$new,0,44);
[Array]::Copy($bytes,$sOff,$new,44,$newLen);
[BitConverter]::GetBytes([UInt32]$newLen).CopyTo($new,40);
[System.IO.File]::WriteAllBytes($out,$new);
Write-Output "TRIMMED $newLen bytes";
`;
      execFile("powershell", ["-NoProfile", "-Command", script], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: String(stderr || err.message || "trim failed").slice(0, 300) });
        return resolve({ ok: true, path: c2.path, note: String(stdout || "").trim().slice(0, 120) });
      });
    });
  }
  if (op === "concat") {
    const extra = (Array.isArray(body.inputs) ? body.inputs : []).map((x) => resolvePath(x)).filter(Boolean);
    if (!extra.length) return { ok: false, error: "missing inputs[]" };
    for (const x of extra) { const c = confine(x); if (!c.ok) return c; }
    const list = [c1.path, ...extra].map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",");
    const script = `
$files=@(${list}); $out='${String(c2.path).replace(/'/g, "''")}';
$all=[System.Collections.Generic.List[byte]]::new();
foreach($f in $files){ $b=[System.IO.File]::ReadAllBytes($f); if($b.Length -gt 44){ for($i=44;$i -lt $b.Length;$i++){ $all.Add($b[$i]) } } };
$new=[byte[]]::new($all.Count+44);
if($all.Count -gt 0){ $first=[System.IO.File]::ReadAllBytes($files[0]); [Array]::Copy($first,0,$new,0,44); };
if($all.Count -gt 0){ $all.CopyTo($new,44); };
[BitConverter]::GetBytes([UInt32]$all.Count).CopyTo($new,40);
[System.IO.File]::WriteAllBytes($out,$new);
Write-Output "JOINED $($files.Count) files";
`;
    return new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-Command", script], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: String(stderr || err.message || "concat failed").slice(0, 300) });
        return resolve({ ok: true, path: c2.path, note: String(stdout || "").trim().slice(0, 120) });
      });
    });
  }
  if (op === "volume") {
    const factor = Math.max(0.1, Math.min(4, Number(body.factor || 1.5)));
    const script = `
$in='${String(c1.path).replace(/'/g, "''")}'; $out='${String(c2.path).replace(/'/g, "''")}'; $f=[double]'${factor}';
$b=[System.IO.File]::ReadAllBytes($in);
$idx=12; $dataOff=-1; $dataLen=0;
while($idx -lt $b.Length-8){ $id=[System.Text.Encoding]::ASCII.GetString($b,$idx,4); $sz=[BitConverter]::ToUInt32($b,$idx+4); if($id -eq 'data'){ $dataOff=$idx+8; $dataLen=$sz; break }; $idx+=8+$sz };
if($dataOff -lt 0){ throw 'no data chunk' };
$bitsPer=[BitConverter]::ToUInt16($b,34);
if($bitsPer -ne 16){ throw 'only 16-bit wav supported' };
for($i=$dataOff; $i -lt $dataOff+$dataLen-1; $i+=2){ $v=[BitConverter]::ToInt16($b,$i); $v=[int][Math]::Max(-32768,[Math]::Min(32767,$v*$f)); [BitConverter]::GetBytes([Int16]$v).CopyTo($b,$i) };
[System.IO.File]::WriteAllBytes($out,$b);
Write-Output "VOLUME x${factor}";
`;
    return new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-Command", script], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: String(stderr || err.message || "volume failed").slice(0, 300) });
        return resolve({ ok: true, path: c2.path, note: String(stdout || "").trim().slice(0, 120) });
      });
    });
  }
  return { ok: false, error: "op must be trim | concat | volume" };
}

// PDF create — minimal valid PDF writer from plain text (no deps, offline).
function makePdf(body) {
  const p = resolvePath(body.path);
  if (!p) return { ok: false, error: "missing path" };
  const c = confine(p);
  if (!c.ok) return c;
  audit("PDF", `→ ${c.path}`);
  try {
    fs.mkdirSync(path.dirname(c.path), { recursive: true });
    const lines = String(body.content || "Empty PDF").split("\n").slice(0, 60);
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
    let text = "BT /F1 16 Tf 50 780 Td 18 TL\n";
    lines.forEach((line, i) => {
      const t = esc(line.slice(0, 90));
      text += i === 0 ? `(${t}) Tj T*\n` : `/F1 12 Tf (${t}) Tj T*\n`;
    });
    text += "ET";
    const objs = [];
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
    objs.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    fs.writeFileSync(c.path, pdf, "binary");
    return { ok: true, path: c.path, bytes: fs.statSync(c.path).size };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; }
}

// ------------------------------------------------------------- video -------
// make_video: render text slides as frames with PowerShell + .NET drawing,
// then encode with ffmpeg (MP4) if available — otherwise write an animated
// GIF with our own minimal GIF89a encoder (offline, no deps).
function crc32Table() {
  if (crc32Table.t) return crc32Table.t;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  crc32Table.t = t;
  return t;
}
function crc32(buf) {
  const t = crc32Table();
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
// LZW-encode raw indexed-color frame into GIF min-code-size 8.
function gifLzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, size0 = minCode + 1, dictMax = 4096;
  let dict = new Map(), next = eoi + 1, codeSize = size0;
  const out = [];
  let cur = 0, curBits = 0;
  const emit = (code) => { cur |= code << curBits; curBits += codeSize; while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; } };
  emit(clear);
  let w = "";
  for (const ch of indices) {
    const wc = w + ch;
    if (w === "") { w = ch; continue; }
    if (dict.has(wc)) { w = wc; continue; }
    emit(dict.has(w) ? dict.get(w) : w);
    if (next < dictMax) dict.set(wc, next++);
    else { emit(clear); dict = new Map(); next = eoi + 1; codeSize = size0; }
    if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    w = ch;
  }
  if (w !== "") emit(dict.has(w) ? dict.get(w) : w);
  emit(eoi);
  if (curBits > 0) out.push(cur & 0xff);
  return out;
}
function writeGif(frames, w, h, delays, outPath) {
  const palette = [0, 0, 0, 255, 255, 255, 16, 185, 129, 40, 44, 52]; // black, white, accent, gray
  let buf = Buffer.from("GIF89a");
  buf = Buffer.concat([buf, Buffer.from([w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255, 0xf1, 0, 0])]);
  buf = Buffer.concat([buf, Buffer.from(palette)]);
  buf = Buffer.concat([buf, Buffer.from([0x21, 0xff, 0x0b]), Buffer.from("NETSCAPE2.0"), Buffer.from([3, 1, 0, 0, 0])]); // loop forever
  frames.forEach((indices, i) => {
    buf = Buffer.concat([buf, Buffer.from([0x21, 0xf9, 4, (delays[i] > 0 ? 0x04 : 0), delays[i] & 255, (delays[i] >> 8) & 255, 0, 0])]);
    buf = Buffer.concat([buf, Buffer.from([0x2c, 0, 0, 0, 0, w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255, 0])]);
    const data = Buffer.from(gifLzw(indices, 8));
    let p = 0;
    buf = Buffer.concat([buf, Buffer.from([8])]);
    while (p < data.length) { const chunk = data.slice(p, p + 255); buf = Buffer.concat([buf, Buffer.from([chunk.length]), chunk]); p += 255; }
    buf = Buffer.concat([buf, Buffer.from([0])]);
  });
  buf = Buffer.concat([buf, Buffer.from([0x3b])]);
  fs.writeFileSync(outPath, buf);
}
// makeVideo moved to media.js (1080p MP4 + edge-tts narration + pptx previews)

// ---------------------------------------------------------- project inspect --
function projectInspect(cwd) {
  const ws = cwd ? resolvePath(cwd) : effectiveWorkspace();
  const c = confine(ws);
  if (!c.ok) return c;
  const info = { ok: true, root: c.path, framework: null, language: null, packageManager: null, git: fs.existsSync(path.join(c.path, ".git")), scripts: {}, dependencies: {}, devDependencies: {}, stats: { files: 0, dirs: 0, byExt: {} }, topDirs: [], testCommand: null, buildCommand: null, devCommand: null };
  // package.json ecosystem
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(c.path, "package.json"), "utf8"));
    info.dependencies = pkg.dependencies || {};
    info.devDependencies = pkg.devDependencies || {};
    info.scripts = pkg.scripts || {};
    info.packageManager = fs.existsSync(path.join(c.path, "pnpm-lock.yaml")) ? "pnpm" : fs.existsSync(path.join(c.path, "yarn.lock")) ? "yarn" : "npm";
    const deps = { ...info.dependencies, ...info.devDependencies };
    if (deps.next) info.framework = "Next.js";
    else if (deps["react-scripts"]) info.framework = "Create React App";
    else if (deps.react) info.framework = "React";
    else if (deps.vue) info.framework = "Vue";
    else if (deps.express) info.framework = "Express";
    else if (deps.electron) info.framework = "Electron";
    info.language = "JavaScript/TypeScript";
    info.devCommand = info.scripts.dev || info.scripts.start || null;
    info.buildCommand = info.scripts.build || null;
    info.testCommand = info.scripts.test || null;
  } catch {}
  // other ecosystems
  if (!info.framework) {
    if (fs.existsSync(path.join(c.path, "requirements.txt")) || fs.existsSync(path.join(c.path, "pyproject.toml"))) { info.language = "Python"; info.framework = "Python"; info.packageManager = "pip"; }
    else if (fs.existsSync(path.join(c.path, "go.mod"))) { info.language = "Go"; info.framework = "Go"; info.packageManager = "go"; }
    else if (fs.existsSync(path.join(c.path, "Cargo.toml"))) { info.language = "Rust"; info.framework = "Rust"; info.packageManager = "cargo"; }
  }
  // structure stats (bounded walk)
  const walk = (d, depth) => {
    if (depth > 4 || info.stats.files >= 5000) return;
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (depth === 1) info.topDirs = entries.filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name)).map((e) => e.name);
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { info.stats.dirs++; walk(full, depth + 1); }
      else {
        info.stats.files++;
        const ext = path.extname(e.name).slice(0, 12).toLowerCase() || "(none)";
        info.stats.byExt[ext] = (info.stats.byExt[ext] || 0) + 1;
      }
    }
  };
  walk(c.path, 1);
  const envKeys = [];
  try {
    const envTxt = fs.readFileSync(path.join(c.path, ".env.example"), "utf8");
    for (const line of envTxt.split("\n")) { const m = line.match(/^([A-Z0-9_]+)=/); if (m) envKeys.push(m[1]); }
  } catch {}
  info.envExampleKeys = envKeys;
  return info;
}

// ---------------------------------------------------------------- sysinfo ----
function sysinfo() {
  return {
    ok: true,
    platform: process.platform, arch: process.arch, node: process.version,
    hostname: os.hostname(), user: os.userInfo().username,
    cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model || "",
    totalMemGB: +(os.totalmem() / 1e9).toFixed(1), freeMemGB: +(os.freemem() / 1e9).toFixed(1),
    uptimeH: +(os.uptime() / 3600).toFixed(1), home: os.homedir(),
    cwd: effectiveWorkspace(), runningProcs: [...procs.values()].filter((p) => p.status === "running").length,
    terminals: terms.size,
  };
}

// --------------------------------------------------------------- approvals ---
const pending = new Map();
let nextReqId = 1;

// kind is the route minus the leading slash, e.g. "file/read", "proc/list".
const SAFE_READ = ["file/read", "file/list", "grep", "search/files", "project/inspect", "sysinfo", "git/status", "git/diff", "git/log", "git/branch", "proc/list", "proc/output", "term/list", "term/output", "checkpoint/list", "office/preview", "voices/edge", "list/voices", "audit"];
function needsApproval(kind) {
  const mode = readMode();
  if (mode === "auto") return false;
  if (mode === "safe" && SAFE_READ.includes(kind)) return false;
  return true; // "ask"
}

// ------------------------------------------------------------------ server ---
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": APP_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  const auth = req.headers["authorization"] || "";
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  // /status is the only unauthenticated route — it just says the bridge exists.
  if (route === "/status" && req.method === "GET") {
    return send(res, 200, { ok: true, mediaVersion: 3, mode: readMode(), pending: pending.size, workspace: effectiveWorkspace(), defaultWorkspace: DEFAULT_WS, procs: procs.size, terms: terms.size });
  }

  // SSE stream — EventSource cannot set headers, so this route accepts the
  // token as a query parameter (still localhost-only, still audited).
  if (route.startsWith("/stream/") && req.method === "GET") {
    const streamId = route.slice("/stream/".length);
    if (url.searchParams.get("token") !== TOKEN) { audit("DENY", "bad token (stream)"); res.writeHead(401); return res.end(); }
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive",
      "Access-Control-Allow-Origin": APP_ORIGIN,
    });
    const o = outputs.get(streamId);
    if (!o) { res.write("event: err\ndata: {\"error\":\"no such stream\"}\n\n"); return res.end(); }
    let since = Number(url.searchParams.get("since") || 0);
    if (since < (o.base || 0)) since = 0;
    // replay backlog, then live
    const back = outSince(streamId, since);
    if (back.ok && back.new) res.write(`data: ${JSON.stringify({ text: back.new, offset: back.offset })}\n\n`);
    const listener = (text) => { try { res.write(`data: ${JSON.stringify({ text, offset: o.total })}\n\n`); } catch {} };
    o.listeners.add(listener);
    const hb = setInterval(() => { try { res.write(": hb\n\n"); } catch {} }, 15000);
    req.on("close", () => { clearInterval(hb); o.listeners.delete(listener); });
    return;
  }

  if (auth !== `Bearer ${TOKEN}`) {
    audit("DENY", "bad token");
    return send(res, 401, { ok: false, error: "unauthorized" });
  }

  // Activity timeline feed (UI spec §12) — last N audit lines, read-only.
  // Accepts GET (?limit=N) and POST (JSON body {limit}) — the app's /api/pc
  // proxy forwards POST.
  if (route === "/audit" && (req.method === "GET" || req.method === "POST")) {
    try {
      let n = 150;
      if (req.method === "GET") {
        n = Math.min(Number(new URL(req.url, "http://x").searchParams.get("limit")) || 150, 500);
      }
      const txt = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n");
      return send(res, 200, { ok: true, lines: txt.slice(-n) });
    } catch (e) { return send(res, 200, { ok: true, lines: [] }); }
  }

  // ------------------------------------------------------- mode + approval
  if (route === "/mode" && req.method === "GET") return send(res, 200, { ok: true, mode: readMode() });
  if (route === "/mode" && req.method === "POST") {
    const { mode } = await readBody(req);
    if (!["ask", "safe", "auto"].includes(mode)) return send(res, 400, { ok: false, error: "bad mode" });
    writeMode(mode);
    audit("MODE", mode);
    return send(res, 200, { ok: true, mode });
  }

  if (route === "/workspace" && req.method === "GET") {
    return send(res, 200, { ok: true, workspace: effectiveWorkspace(), explicit: readWorkspace(), default: DEFAULT_WS });
  }
  if (route === "/workspace" && req.method === "POST") {
    const parsed = await readBody(req);
    const wsPath = parsed.path;
    // Clearing the workspace is a real security boundary (it re-opens the whole
    // drive's default scope), so require an EXPLICIT clear flag. An empty POST
    // (e.g. an accidental poll) must never wipe the user's chosen folder.
    if (!wsPath && parsed.clear !== true) {
      return send(res, 200, { ok: true, workspace: effectiveWorkspace(), explicit: readWorkspace(), default: DEFAULT_WS, note: "nothing changed — pass clear:true to reset" });
    }
    if (!wsPath) { writeWorkspace(null); audit("WORKSPACE", "cleared → default " + DEFAULT_WS); return send(res, 200, { ok: true, workspace: DEFAULT_WS }); }
    const abs = resolvePath(wsPath);
    try {
      if (!fs.statSync(abs).isDirectory()) return send(res, 400, { ok: false, error: "not a directory" });
    } catch { return send(res, 400, { ok: false, error: "folder does not exist" }); }
    writeWorkspace(abs);
    audit("WORKSPACE", abs);
    return send(res, 200, { ok: true, workspace: abs });
  }

  // Raw file bytes for media previews (img/audio/video in the popup).
  // Confined to the workspace like every other file op; small files only.
  if (route === "/file/raw" && req.method === "GET") {
    const p = resolvePath(new URL(req.url, `http://localhost:${PORT}`).searchParams.get("path"));
    if (!p) return send(res, 400, { ok: false, error: "missing path" });
    const c = confine(p);
    if (!c.ok) return send(res, 403, { ok: false, error: c.error });
    try {
      const stat = fs.statSync(c.path);
      if (stat.size > 80 * 1024 * 1024) return send(res, 413, { ok: false, error: "file too large for preview" });
      audit("RAW", c.path);
      const data = fs.readFileSync(c.path);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": data.length,
        "Access-Control-Allow-Origin": APP_ORIGIN,
      });
      return res.end(data);
    } catch (e) { return send(res, 404, { ok: false, error: String(e.message) }); }
  }

  if (route === "/pending" && req.method === "GET") {
    const list = [...pending.values()].map((p) => ({ id: p.id, kind: p.kind, summary: p.summary }));
    return send(res, 200, { ok: true, pending: list });
  }
  if (route === "/approve" && req.method === "POST") {
    const { id, allow, all } = await readBody(req);
    if (all) { // approve/deny every pending request at once
      const n = pending.size;
      for (const [pid, p] of [...pending.entries()]) { pending.delete(pid); p.resolve(allow !== false); audit(allow !== false ? "ALLOW" : "DENY", `${p.kind} ${p.summary} (all)`); }
      return send(res, 200, { ok: true, resolved: n });
    }
    const p = pending.get(id);
    if (!p) return send(res, 404, { ok: false, error: "no such request" });
    pending.delete(id);
    p.resolve(!!allow);
    audit(allow ? "ALLOW" : "DENY", `${p.kind} ${p.summary}`);
    return send(res, 200, { ok: true });
  }
  if (route === "/deny" && req.method === "POST") {
    const { id } = await readBody(req);
    const p = pending.get(id);
    if (!p) return send(res, 404, { ok: false, error: "no such request" });
    pending.delete(id);
    p.resolve(false);
    audit("DENY", `${p.kind} ${p.summary}`);
    return send(res, 200, { ok: true });
  }

  const CONTROL_ROUTES = ["/status", "/mode", "/workspace", "/pending", "/approve", "/deny"];
  if ((req.method === "POST" && CONTROL_ROUTES.includes(route)) || (req.method === "POST" && route === "/status")) {
    return send(res, 404, { ok: false, error: "handled above" });
  }

  const body = await readBody(req);

  const doOp = async () => {
    switch (route) {
      // ------------------------------------------------------------ files ---
      case "/file/read": {
        const p = resolvePath(body.path);
        if (!p) return { ok: false, error: "missing path" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("READ", c.path);
        try {
          const stat = fs.statSync(c.path);
          if (stat.size > 2 * 1024 * 1024) return { ok: false, error: "file too large (2MB limit)" };
          return { ok: true, content: fs.readFileSync(c.path, "utf8"), size: stat.size, mtime: stat.mtimeMs };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/write": {
        const p = resolvePath(body.path);
        if (!p || body.content == null) return { ok: false, error: "missing path/content" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("WRITE", c.path, `${String(body.content).length} chars`);
        try {
          fs.mkdirSync(path.dirname(c.path), { recursive: true });
          fs.writeFileSync(c.path, String(body.content), "utf8");
          return { ok: true, path: c.path, bytes: Buffer.byteLength(String(body.content)) };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/list": {
        const p = resolvePath(body.path || effectiveWorkspace());
        const c = confine(p);
        if (!c.ok) return c;
        audit("LIST", c.path);
        try {
          const entries = fs.readdirSync(c.path, { withFileTypes: true })
            .filter((e) => !IGNORE_DIRS.has(e.name))
            .map((e) => {
              let size = null, mtime = null;
              try { const st = fs.statSync(path.join(c.path, e.name)); size = st.size; mtime = st.mtimeMs; } catch {}
              return { name: e.name, dir: e.isDirectory(), size, mtime };
            });
          return { ok: true, path: c.path, entries };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/delete": {
        const p = resolvePath(body.path);
        if (!p) return { ok: false, error: "missing path" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("DELETE", c.path);
        try {
          const stat = fs.statSync(c.path);
          if (stat.isDirectory()) fs.rmSync(c.path, { recursive: body.recursive !== false });
          else fs.unlinkSync(c.path);
          return { ok: true, path: c.path };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/mkdir": {
        const p = resolvePath(body.path);
        if (!p) return { ok: false, error: "missing path" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("MKDIR", c.path);
        try { fs.mkdirSync(c.path, { recursive: true }); return { ok: true, path: c.path }; }
        catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/move": {
        const from = resolvePath(body.from);
        const to = resolvePath(body.to);
        if (!from || !to) return { ok: false, error: "missing from/to" };
        const c1 = confine(from); const c2 = confine(to);
        if (!c1.ok) return c1; if (!c2.ok) return c2;
        audit("MOVE", `${c1.path} → ${c2.path}`);
        try {
          fs.mkdirSync(path.dirname(c2.path), { recursive: true });
          fs.renameSync(c1.path, c2.path);
          return { ok: true, from: c1.path, to: c2.path };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/file/edit": {
        const p = resolvePath(body.path);
        if (!p || body.search == null || body.replace == null) return { ok: false, error: "missing path/search/replace" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("EDIT", `${c.path} — replace ${JSON.stringify(String(body.search).slice(0, 60))}`);
        try {
          const src = fs.readFileSync(p, "utf8");
          const count = src.split(body.search).length - 1;
          if (count === 0) return { ok: false, error: "search text not found in file" };
          const updated = body.all === false
            ? src.replace(body.search, body.replace)
            : src.split(body.search).join(body.replace);
          fs.writeFileSync(p, updated, "utf8");
          return { ok: true, path: p, replacements: count };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/grep": {
        const dir = resolvePath(body.path || effectiveWorkspace());
        const pattern = String(body.pattern || "");
        if (!pattern) return { ok: false, error: "missing pattern" };
        const c = confine(dir);
        if (!c.ok) return c;
        audit("GREP", `${pattern} in ${c.path}`);
        try {
          const hits = [];
          const re = new RegExp(pattern, body.ignoreCase === false ? "" : "i");
          const walk = (d, depth) => {
            if (depth > 8 || hits.length >= 200) return;
            let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
            for (const e of entries) {
              if (hits.length >= 200) return;
              if (IGNORE_DIRS.has(e.name)) continue;
              const full = path.join(d, e.name);
              if (e.isDirectory()) { walk(full, depth + 1); continue; }
              try {
                if (fs.statSync(full).size > 1024 * 1024) continue;
                const lines = fs.readFileSync(full, "utf8").split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (re.test(lines[i])) {
                    hits.push({ file: path.relative(c.path, full).split(path.sep).join("/"), line: i + 1, text: lines[i].trim().slice(0, 200) });
                    if (hits.length >= 200) return;
                  }
                }
              } catch {}
            }
          };
          walk(c.path, 0);
          return { ok: true, count: hits.length, hits: hits.map((h) => ({ ...h, text: redact(h.text) })) };
        } catch (e) { return { ok: false, error: String(e.message) }; }
      }
      case "/search/files": {
        const dir = resolvePath(body.path || effectiveWorkspace());
        const q = String(body.query || "").toLowerCase();
        if (!q) return { ok: false, error: "missing query" };
        const c = confine(dir);
        if (!c.ok) return c;
        audit("SEARCH_FILES", `${q} in ${c.path}`);
        const results = [];
        const walk = (d, depth) => {
          if (depth > 8 || results.length >= 200) return;
          let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (IGNORE_DIRS.has(e.name)) continue;
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full, depth + 1);
            else if (e.name.toLowerCase().includes(q)) {
              results.push(path.relative(c.path, full).split(path.sep).join("/"));
              if (results.length >= 200) return;
            }
          }
        };
        walk(c.path, 0);
        return { ok: true, count: results.length, files: results };
      }

      // -------------------------------------------------------- processes ---
      case "/proc/start": {
        if (!body.command) return { ok: false, error: "missing command" };
        return procStart(String(body.command), body.cwd);
      }
      case "/proc/list":
        return { ok: true, procs: [...procs.values()].map(serializeProc) };
      case "/proc/output": {
        const id = body.id;
        const p = procs.get(id);
        if (!p) return { ok: false, error: "no such process" };
        const o = outSince(id, Number(body.since || 0));
        if (!o.ok) return o;
        return { ok: true, id, proc: serializeProc(p), new: redact(o.new), offset: o.offset, closed: o.closed };
      }
      case "/proc/stop": {
        if (!body.id) return { ok: false, error: "missing id" };
        return procStop(body.id);
      }

      // -------------------------------------------------------- terminals ---
      case "/term/create": return termCreate(body.cwd, body.shell);
      case "/term/list": return { ok: true, terms: [...terms.keys()].map((id) => ({ id, cwd: terms.get(id).cwd, kind: terms.get(id).kind })) };
      case "/term/write": {
        if (!body.id || body.input == null) return { ok: false, error: "missing id/input" };
        return termWrite(body.id, body.input);
      }
      case "/term/output": {
        const o = outSince(body.id, Number(body.since || 0));
        if (!o.ok) return o;
        return { ok: true, id: body.id, new: o.new, offset: o.offset, closed: o.closed };
      }
      case "/term/kill": {
        if (!body.id) return { ok: false, error: "missing id" };
        return termKill(body.id);
      }

      // --------------------------------------------------------------- git ---
      case "/git/status": return git(["status", "--porcelain=v1", "-b"], body.cwd).then((r) => ({ ...r, _cmd: "status" }));
      case "/git/diff": return git(["diff", ...(body.staged ? ["--staged"] : [])], body.cwd);
      case "/git/log": return git(["log", "--oneline", "-n", String(Math.min(Number(body.limit) || 20, 100))], body.cwd);
      case "/git/branch": return git(body.create ? ["checkout", "-b", String(body.create)] : body.name ? ["checkout", String(body.name)] : ["branch", "-a"], body.cwd);
      case "/git/checkout": {
        if (!body.name) return { ok: false, error: "missing name" };
        return git(["checkout", String(body.name)], body.cwd);
      }
      case "/git/stage": return git(body.path ? ["add", String(body.path)] : ["add", "-A"], body.cwd);
      // Commit through an args ARRAY (gitExec) — never through `cmd /c` — so a
      // commit message can never smuggle shell commands (injection-safe).
      case "/git/commit": {
        const msg = String(body.message || "").trim();
        if (!msg) return { ok: false, error: "missing message" };
        if (msg.length > 500) return { ok: false, error: "message too long (max 500 chars)" };
        return gitExec(["commit", "-m", msg], body.cwd);
      }

      // -------------------------------------------------------- checkpoints --
      case "/checkpoint/create": return checkpointCreate(body.label, body.cwd);
      case "/checkpoint/list": return { ok: true, checkpoints: cpIndex() };
      case "/checkpoint/rollback": {
        if (!body.id) return { ok: false, error: "missing id" };
        return checkpointRollback(body.id, body);
      }

      // -------------------------------------------------------- intelligence --
      case "/project/inspect": return projectInspect(body.cwd);
      case "/sysinfo": return sysinfo();

      // ----------------------------------------------------- office / media --
      case "/make/docx": return makeOffice("docx", body);
      case "/make/xlsx": return makeOffice("xlsx", body);
      case "/make/pptx": return makeOffice("pptx", body);
      case "/make/pdf": return makePdf(body);
      case "/make/video": return media.makeVideo(body);
      case "/tts/edge": return media.ttsEdge(body);
      case "/voices/edge": return media.edgeVoices();
      case "/office/preview": return media.officePreview(body);
      case "/make/audio": return makeAudio(body);
      case "/list/voices": return listVoices();
      case "/edit/audio": return audioEdit(body);

      // ------------------------------------------------------- downloads ---
      case "/file/download": {
        const url = String(body.url || "");
        const p = resolvePath(body.path);
        if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: "missing/invalid url" };
        // SSRF guard (directive §11): never download from loopback / private /
        // link-local / metadata targets — the bridge runs on a machine that HAS
        // services on localhost worth protecting.
        let host;
        try { host = new URL(url).hostname.toLowerCase(); } catch { return { ok: false, error: "invalid url" }; }
        const SSRF_BLOCK = /^(localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\]|\[fc|\[fd|metadata\.google\.internal$)/i;
        const m172 = host.match(/^172\.(\d+)\./);
        const isPrivate = SSRF_BLOCK.test(host) || (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31);
        if (isPrivate) { audit("BLOCK", "download " + url.slice(0, 100), "SSRF private target"); return { ok: false, error: "blocked: private/loopback target" }; }
        if (!p) return { ok: false, error: "missing path" };
        const c = confine(p);
        if (!c.ok) return c;
        audit("DOWNLOAD", `${url.slice(0, 120)} → ${c.path}`);
        try {
          fs.mkdirSync(path.dirname(c.path), { recursive: true });
          const maxBytes = Number(body.maxBytes) || 200 * 1024 * 1024;
          const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(Number(body.timeoutMs) || 300000) });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > maxBytes) return { ok: false, error: `too big (${buf.length}B > limit ${maxBytes}B)` };
          fs.writeFileSync(c.path, buf);
          return { ok: true, path: c.path, bytes: buf.length, type: res.headers.get("content-type") || null };
        } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; }
      }

      case "/exec": {
        const { command, cwd } = body;
        if (!command) return { ok: false, error: "missing command" };
        const policy = commandPolicy(String(command));
        if (policy) { audit("BLOCK", String(command).slice(0, 160), policy); return { ok: false, error: policy }; }
        const resolvedCwd = cwd ? resolvePath(cwd) : effectiveWorkspace();
        const c = confine(resolvedCwd);
        if (!c.ok) return c;
        audit("EXEC", String(command).slice(0, 200));
        return runCommand(command, c.path).then((r) => ({ ...r, stdout: redact(r.stdout), stderr: redact(r.stderr) }));
      }
      default:
        return { ok: false, error: "unknown route" };
    }
  };

  // Permission gate: park the op until approved (ask/safe modes).
  const kind = route.replace(/^\//, "");
  if (needsApproval(kind)) {
    const id = nextReqId++;
    const summary =
      route === "/exec" ? String(body.command || "").slice(0, 160) :
      route === "/proc/start" ? String(body.command || "").slice(0, 160) :
      route === "/file/write" ? `${body.path} (${String(body.content || "").length} chars)` :
      route === "/file/delete" ? String(body.path || "") :
      route === "/file/move" ? `${body.from} → ${body.to}` :
      route === "/term/write" ? String(body.input || "").slice(0, 160) :
      route === "/checkpoint/rollback" ? String(body.id || "") :
      route;
    const allowed = await new Promise((resolve) => {
      pending.set(id, { id, kind: route, summary, resolve });
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(false); } }, 5 * 60 * 1000);
    });
    if (!allowed) return send(res, 403, { ok: false, error: "denied by user" });
  }

  const result = await doOp();
  audit("RESULT", `${route} ${result.ok ? "ok" : "error: " + (result.error || "").slice(0, 100)}`);
  return send(res, 200, result);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[bridge] PC bridge v2 listening on http://127.0.0.1:${PORT}`);
  console.log(`[bridge] mode=${readMode()} — change it from the app's PC Access settings`);
  console.log(`[bridge] workspace=${effectiveWorkspace()}${readWorkspace() ? "" : " (default)"}`);
});

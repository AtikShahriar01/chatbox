// media.js — video/narration/preview engine for the PC bridge.
//  - 1080p MP4 via bundled ffmpeg (workspace .tmp, no system install)
//  - Bangla neural TTS via edge-tts (python -m edge_tts, bn-BD-NabanitaNeural)
//  - slide PNGs via PowerShell System.Drawing (Nirmala UI renders Bangla)
//  - PPTX visual previews rendered at creation time (same layout, white theme)
// All paths passed in are already confined by server.js; routes that take raw
// user paths confine here via the ctx injected by media.init().

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = __dirname;
const DEFAULT_WS = path.resolve(ROOT, "..");
const FFMPEG_DIR = path.join(DEFAULT_WS, ".tmp", "ffmpeg-master-latest-win64-gpl", "bin");
const LOCAL_FFMPEG = path.join(FFMPEG_DIR, "ffmpeg.exe");
const LOCAL_FFPROBE = path.join(FFMPEG_DIR, "ffprobe.exe");

let CTX = { confine: (p) => ({ ok: true, path: p }), audit: () => {}, runCommand: async () => ({ ok: false, error: "no runCommand" }) };
function init(ctx) { CTX = ctx; }

const IS_WIN_LIKE = process.platform === "win32";

function resolveFfmpeg() { return fs.existsSync(LOCAL_FFMPEG) ? LOCAL_FFMPEG : "ffmpeg"; }
function resolveFfprobe() { return fs.existsSync(LOCAL_FFPROBE) ? LOCAL_FFPROBE : "ffprobe"; }

// ------------------------------------------------------------- edge-tts ----
// NOTE: never resolve python by bare name — the WindowsApps alias silently
// fails in hidden/detached sessions. Prefer the REAL python.exe by absolute
// path, and verify edge_tts is importable before trusting a candidate.
const PY_CANDIDATES = [
  "C:/Users/Atik/AppData/Local/Python/pythoncore-3.14-64/python.exe",
  path.join(DEFAULT_WS.replace(/\\/g, "/"), ".home/AppData/Local/Python/pythoncore-3.14-64/python.exe"),
  "python", "py", "python3",
];
let _pyCmd = undefined; // undefined = not probed, null = probe failed
function detectPython() {
  if (_pyCmd !== undefined) return Promise.resolve(_pyCmd);
  return PY_CANDIDATES.reduce(
    (chain, cmd) =>
      chain.then((found) => {
        if (found) return found;
        if (cmd !== "python" && cmd !== "py" && cmd !== "python3" && !fs.existsSync(cmd)) return null;
        return new Promise((resolve) => {
          execFile(cmd, ["-c", "import edge_tts;print(1)"], { timeout: 25000, windowsHide: true }, (err, stdout) => {
            resolve(err || String(stdout).trim() !== "1" ? null : cmd);
          });
        });
      }),
    Promise.resolve(null)
  ).then((found) => { _pyCmd = found; return found; });
}

const EDGE_VOICES = [
  "bn-BD-NabanitaNeural",   // Bangladeshi Bangla — female (the "deshi girl" voice)
  "bn-BD-PradeepNeural",    // Bangladeshi Bangla — male
  "bn-IN-TanishaaNeural",   // Indian Bangla — female
  "en-US-JennyNeural",
  "en-US-AriaNeural",
  "hi-IN-SwaraNeural",
];

function edgeVoices() {
  return detectPython().then((py) => ({
    ok: true, engine: py ? "edge-tts" : "sapi-fallback", installed: !!py,
    voices: EDGE_VOICES, default: "bn-BD-NabanitaNeural",
  }));
}

// text → mp3 file via edge-tts (needs internet; Microsoft neural service).
// edge-tts is occasionally flaky (NoAudioReceived on token/rate hiccups) —
// retry up to 3 times with a short backoff before giving up.

function ttsOnce(py, voice, text, outPath) {
  // Run through the bridge's own runCommand — the exact mechanism /exec uses,
  // which is the only spawn shape empirically reliable from this process.
  // Zero-quote command; no-space scratch dir; Node copies result afterwards.
  const SCRATCH = "H:/cb-tts";
  try { fs.mkdirSync(SCRATCH, { recursive: true }); } catch {}
  const id = crypto.randomBytes(6).toString("hex");
  const textFile = SCRATCH + "/" + id + ".txt";
  const mediaTmp = SCRATCH + "/" + id + ".mp3";
  fs.writeFileSync(textFile, text.slice(0, 3000), "utf8");
  const pyWin = String(py).split("/").join("/");
  // WORKING COMBO (proven via /exec): write a .bat, then runCommand("H:/cb-tts/x.bat").
  // The bat does its own parsing (backslash paths fine inside a bat file);
  // logs to its own file; done-marker tells Node the bat finished.
  const batFile = `${SCRATCH}/${id}.bat`;
  const doneFile = `${SCRATCH}/${id}.done`;
  const pyBs = String(py).replace(/\//g, "\\");
  const tfWin = textFile.replace(/\//g, "\\");
  const mfWin = mediaTmp.replace(/\//g, "\\");
  const lgWin = `${SCRATCH.replace(/\//g, "\\")}\\${id}.log`;
  const dfWin = doneFile.replace(/\//g, "\\");
  const bat =
    `@echo off\r\n` +
    `cd /d H:\\\r\n` +
    `"${pyBs}" -m edge_tts --voice ${voice} -f "${tfWin}" --write-media "${mfWin}" > "${lgWin}" 2>&1\r\n` +
    `echo %ERRORLEVEL% > "${dfWin}"\r\n`;
  fs.writeFileSync(batFile, bat, "utf8");
  // Call the bridge's OWN /exec HTTP route — the exact path that has worked
  // 100% of the time today, vs every direct spawn shape from this process.
  const callExec = (attempt) => new Promise((resolveHttp) => {
    fetch("http://127.0.0.1:8765/exec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + fs.readFileSync(path.join(ROOT, "bridge-token.txt"), "utf8").trim(),
      },
      body: JSON.stringify({ command: batFile }),
      signal: AbortSignal.timeout(170000),
    }).then((res) => res.json()).then(resolveHttp).catch((e) => resolveHttp({ ok: false, stderr: String(e.message) }));
  });
  return callExec().then(async (r) => {
    const fail = (msg) => {
      try { fs.writeFileSync(path.join(os.tmpdir(), "edge-tts-last-error.txt"), "BAT=" + batFile + "\n" + msg, "utf8"); } catch {}
      try { fs.unlinkSync(textFile); } catch {}
      try { fs.unlinkSync(batFile); } catch {}
      try { fs.unlinkSync(mediaTmp); } catch {}
      return null;
    };
    let ok = false;
    try { ok = fs.statSync(mediaTmp).size > 500; } catch {}
    if (!ok) {
      const log = `${SCRATCH}/${id}.log`;
      const detail = fs.existsSync(log) ? fs.readFileSync(log, "utf8").slice(0, 800) : "(no log)";
      return fail(r.ok ? "bat ran but no audio: " + detail : "exit " + (r.exitCode ?? "?") + ": " + String(r.stderr || detail).slice(0, 800));
    }
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(mediaTmp, outPath);
      const okOut = fs.statSync(outPath).size > 500 ? outPath : null;
      try { fs.unlinkSync(textFile); } catch {}
      try { fs.unlinkSync(batFile); } catch {}
      try { fs.unlinkSync(mediaTmp); } catch {}
      try { fs.unlinkSync(doneFile); } catch {}
      return okOut;
    } catch (e) { return fail(String(e.message)); }
  });
}

async function ttsWithRetry(py, voice, text, outPath, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await ttsOnce(py, voice, text, outPath, i);
    if (r) return r;
    // the TTS service throttles rapid repeats — 4s→8s→12s spacing (proven: a
    // 6s gap between /exec calls succeeded 3/3 while 1.2-4s gaps failed)
    await new Promise((res) => setTimeout(res, 4000 + i * 4000));
  }
  return null;
}

function ttsEdge(body) {
  const p = body.path ? path.resolve(body.path) : null;
  if (!p) return Promise.resolve({ ok: false, error: "missing path" });
  const c = CTX.confine(p);
  if (!c.ok) return Promise.resolve(c);
  const text = String(body.text || "").trim();
  if (!text) return Promise.resolve({ ok: false, error: "missing text" });
  const voice = String(body.voice || "bn-BD-NabanitaNeural");
  CTX.audit("TTS_EDGE", `${voice} → ${c.path} (${text.length} chars)`);
  return detectPython().then((py) => {
    if (!py) return { ok: false, error: "edge-tts not installed (python -m pip install edge-tts)" };
    fs.mkdirSync(path.dirname(c.path), { recursive: true });
    return ttsWithRetry(py, voice, text, c.path).then((r) =>
      r ? { ok: true, path: c.path, bytes: fs.statSync(c.path).size, voice }
        : { ok: false, error: "edge-tts failed after retries (see edge-tts-last-error.txt)" });
  });
}

function audioDuration(file) {
  return new Promise((resolve) => {
    execFile(resolveFfprobe(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
      { timeout: 30000, windowsHide: true }, (err, stdout) => {
        const d = parseFloat(String(stdout || "").trim());
        resolve(err || !isFinite(d) || d <= 0 ? null : d);
      });
  });
}

// ------------------------------------------------------- slide rendering ----
// theme: "dark" (video) | "light" (pptx preview). Unicode-safe (Nirmala UI).
function psEscape(s) { return String(s).replace(/'/g, "''"); }
function wrapText(s, max) {
  const words = String(s).split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildSlideScript(slides, { w, h, theme, tmpDir }) {
  const dark = theme === "dark";
  const bg = dark ? "[System.Drawing.Color]::FromArgb(15,17,21)" : "[System.Drawing.Color]::White";
  const headH = Math.round(h * 0.2);
  const titleSize = Math.round(h * 0.062);           // ~67pt @1080p
  const bodySize = Math.round(h * 0.033);            // ~36pt @1080p
  const titleY = Math.round(h * 0.045);
  const bodyX = Math.round(w * 0.07);
  const bodyY = Math.round(h * 0.3);
  const bodyStep = Math.round(h * 0.085);
  const accent = dark ? "16,185,129" : "5,150,105";
  const headCol = dark ? "55,48,163" : "31,41,55";
  const titleCol = dark ? "255,255,255" : "31,41,55";
  const bodyCol = dark ? "119,136,153" : "55,65,81";

  const parts = slides.map((s, i) => {
    const title = psEscape(String(s.title || `Slide ${i + 1}`)).slice(0, 120);
    const bulletDraws = [];
    let row = 0;
    for (const b of (s.bullets || []).slice(0, 6)) {
      const lines = wrapText(b, dark ? 78 : 70).slice(0, 2);
      for (const ln of lines) {
        bulletDraws.push(`$d.DrawString('• ${psEscape(ln)}', $f2, $br2, ${bodyX}, ${bodyY + row * bodyStep})`);
        row++;
      }
    }
    return `$bmp = New-Object System.Drawing.Bitmap(${w},${h})
$d = [System.Drawing.Graphics]::FromImage($bmp)
$d.SmoothingMode = 'AntiAlias'
$d.TextRenderingHint = 'AntiAliasGridFit'
$d.Clear(${bg})
$d.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(${headCol}))), 0, 0, ${w}, ${headH})
$d.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(${accent}))), 0, ${headH}, ${w}, 6)
$d.DrawString('${title}', $f1, $br1, ${Math.round(w * 0.05)}, ${titleY})
${bulletDraws.join("\n")}
$d.DrawString('Chatbox Agent', $f3, $br3, ${w - 320}, ${h - 60})
$bmp.Save((Join-Path $dir ('f' + ${i} + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
$d.Dispose(); $bmp.Dispose()`;
  }).join("\n");

  // UTF-8 with BOM so Windows PowerShell reads Bangla correctly
  const script = `Add-Type -AssemblyName System.Drawing
$dir = '${psEscape(tmpDir)}'
$f1 = New-Object System.Drawing.Font('Nirmala UI',${titleSize},[System.Drawing.FontStyle]::Bold)
$f2 = New-Object System.Drawing.Font('Nirmala UI',${bodySize})
$f3 = New-Object System.Drawing.Font('Segoe UI',${Math.round(h * 0.016)})
$br1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(${titleCol}))
$br2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(${bodyCol}))
$br3 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(${dark ? "100,116,139" : "156,163,175"}))
${parts}
Write-Output RENDERED`;
  return "\ufeff" + script;
}

function renderSlides(slides, opts) {
  const tmpDir = opts.tmpDir || path.join(os.tmpdir(), "media-" + crypto.randomBytes(4).toString("hex"));
  fs.mkdirSync(tmpDir, { recursive: true });
  const script = buildSlideScript(slides, { ...opts, tmpDir });
  const ps1 = path.join(tmpDir, "render.ps1");
  fs.writeFileSync(ps1, script, "utf8");
  return new Promise((resolve) => {
    execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { timeout: 180000, windowsHide: true, maxBuffer: 2e6 }, (err, stdout) => {
        if (err || !String(stdout).includes("RENDERED")) return resolve(null);
        resolve(slides.map((_, i) => path.join(tmpDir, "f" + i + ".png")).filter((p) => fs.existsSync(p)));
      });
  });
}

// PPTX visual preview: render the same slides in a white "slide deck" theme,
// stored beside the file: <dir>/.previews/<base>/slide-N.png
async function renderPptxPreviews(slides, pptxPath) {
  const base = path.basename(pptxPath).replace(/\.[^.]+$/, "");
  const dir = path.join(path.dirname(pptxPath), ".previews", base);
  fs.mkdirSync(dir, { recursive: true });
  const pngs = await renderSlides(slides, { w: 1280, h: 720, theme: "light", tmpDir: dir });
  if (!pngs) return null;
  return pngs.map((p, i) => { // normalize name
    const dest = path.join(dir, `slide-${i}.png`);
    if (p !== dest) { fs.copyFileSync(p, dest); try { fs.unlinkSync(p); } catch {} }
    return dest;
  });
}

// /office/preview → base64 slide images for the popup
async function officePreview(body) {
  const p = body.path ? path.resolve(body.path) : null;
  if (!p) return { ok: false, error: "missing path" };
  const c = CTX.confine(p);
  if (!c.ok) return c;
  const base = path.basename(c.path).replace(/\.[^.]+$/, "");
  const dir = path.join(path.dirname(c.path), ".previews", base);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^slide-\d+\.png$/.test(f)).sort(); } catch {}
  if (!files.length) return { ok: false, error: "no previews (regenerate the file with the new bridge)" };
  const slides = files.map((f) => "data:image/png;base64," + fs.readFileSync(path.join(dir, f)).toString("base64"));
  return { ok: true, path: c.path, count: slides.length, slides };
}

// ------------------------------------------------------------- makeVideo ----
// slides[] (+ optional narration[] / slide.narration) → narrated MP4 (ffmpeg)
// or GIF (legacy path handled in server.js). resolution: "1080p" | "720p".
async function makeVideo(body) {
  const p = body.path ? path.resolve(body.path) : null;
  if (!p) return { ok: false, error: "missing path" };
  const c = CTX.confine(p);
  if (!c.ok) return c;
  CTX.audit("VIDEO", `→ ${c.path}`);
  const ext = (c.path.split(".").pop() || "").toLowerCase();
  if (ext !== "mp4") return { ok: false, error: "media.makeVideo handles .mp4 (send .gif for the offline GIF encoder)" };

  const slides = (Array.isArray(body.slides) && body.slides.length
    ? body.slides
    : String(body.content || "").split(/\n\s*\n/).map((block) => {
        const lines = block.split("\n").map((l) => l.replace(/^#\s+/, "").trim()).filter(Boolean);
        return { title: lines[0] || " ", bullets: lines.slice(1) };
      })
  ).slice(0, 80);
  if (!slides.length) return { ok: false, error: "no slides/content" };

  const res1080 = String(body.resolution || "1080p") === "1080p";
  const W = res1080 ? 1920 : 1280, H = res1080 ? 1080 : 720;
  const SEC = Math.max(1, Number(body.secondsPerSlide || 5));
  const voice = String(body.voice || "bn-BD-NabanitaNeural");
  const narrate = body.narrate !== false; // auto-narrate from bullets when no explicit narration

  // 1) slide PNGs (dark theme)
  const tmpDir = path.join(os.tmpdir(), "vid-" + crypto.randomBytes(6).toString("hex"));
  const pngs = await renderSlides(slides, { w: W, h: H, theme: "dark", tmpDir });
  if (!pngs || pngs.length !== slides.length) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: "slide rendering failed (System.Drawing)" };
  }

  // 2) narration audio per slide (edge-tts) + per-slide durations
  const narration = slides.map((s, i) => {
    const n = (body.narration && body.narration[i]) || s.narration ||
      (narrate ? [s.title, ...(s.bullets || [])].filter(Boolean).join(". ") : "");
    return String(n || "").trim();
  });
  const py = await detectPython();
  const durations = [];
  const audioFiles = [];
  let ttsNote = py ? null : "edge-tts unavailable — silent slides (install: python -m pip install edge-tts)";
  for (let i = 0; i < slides.length; i++) {
    let audio = null, dur = SEC;
    if (py && narration[i]) {
      const mp3 = path.join(tmpDir, `n${i}.mp3`);
      const r = await ttsWithRetry(py, voice, narration[i], mp3);
      if (r) { const d = await audioDuration(r); if (d) { audio = r; dur = Math.max(1.5, d + 0.5); } }
    }
    audioFiles.push(audio);
    durations.push(dur);
  }

  // 3) per-slide segments → concat → final MP4 (all inside tmp, then move)
  const ffmpeg = resolveFfmpeg();
  const segEncode = (i) => new Promise((resolve) => {
    const seg = path.join(tmpDir, `seg${i}.mp4`);
    const args = ["-y", "-loop", "1", "-framerate", "30", "-i", pngs[i]];
    if (audioFiles[i]) args.push("-i", audioFiles[i]);
    args.push("-t", String(durations[i]),
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-pix_fmt", "yuv420p",
      "-vf", `scale=${W}:${H}`);
    if (audioFiles[i]) args.push("-c:a", "aac", "-b:a", "160k", "-shortest");
    else args.push("-an");
    args.push(seg);
    execFile(ffmpeg, args, { timeout: 300000, windowsHide: true, maxBuffer: 2e6 }, (err) => {
      resolve(!err && fs.existsSync(seg) ? seg : null);
    });
  });
  const segs = [];
  for (let i = 0; i < slides.length; i++) {
    const seg = await segEncode(i);
    if (!seg) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} return { ok: false, error: `segment encode failed at slide ${i + 1}` }; }
    segs.push(seg);
  }
  const listFile = path.join(tmpDir, "list.txt");
  fs.writeFileSync(listFile, segs.map((s) => `file '${s.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  fs.mkdirSync(path.dirname(c.path), { recursive: true });
  const finalOk = await new Promise((resolve) => {
    execFile(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", c.path],
      { timeout: 300000, windowsHide: true, maxBuffer: 2e6 }, (err) => {
        resolve(!err && fs.existsSync(c.path) && fs.statSync(c.path).size > 10000);
      });
  });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  if (!finalOk) return { ok: false, error: "final concat failed" };
  return {
    ok: true, path: c.path, bytes: fs.statSync(c.path).size, encoder: "ffmpeg",
    resolution: `${W}x${H}`, slides: slides.length,
    totalSeconds: Math.round(durations.reduce((a, b) => a + b, 0)),
    voice: py ? voice : null, note: ttsNote,
  };
}

module.exports = { init, makeVideo, ttsEdge, edgeVoices, officePreview, renderPptxPreviews, resolveFfmpeg };

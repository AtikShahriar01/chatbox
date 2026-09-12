// Agent tool registry — every tool maps to a bridge op (via /api/pc) and
// describes its args for the model's JSON action protocol (master §9).
// The engine validates the model's choice against this registry: the AI is
// untrusted input and may only call what exists here (TRD §20).

export const TOOLS = {
  // ------------------------------------------------------------ planning --
  // The agent's live checklist — handled INSIDE the engine (never reaches the
  // bridge). Big tasks must start with it and update it as work progresses,
  // so the user watches items tick off in real time.
  set_todo:     { op: "_set_todo", args: ["items"], desc: "Publish or update your live task checklist. items = array of {text, status} where status is one of: pending, doing, done, failed. Start every task by publishing 3-8 steps, then update statuses as you finish each one.", risk: "low", readOnly: true },

  // ------------------------------------------------------------ files ----
  list_files:   { op: "/file/list", args: ["path?"], desc: "List a directory's entries", risk: "low", readOnly: true },
  read_file:    { op: "/file/read", args: ["path"], desc: "Read a text file (≤2MB)", risk: "low", readOnly: true },
  write_file:   { op: "/file/write", args: ["path", "content"], desc: "Create or overwrite a file", risk: "medium" },
  edit_file:    { op: "/file/edit", args: ["path", "search", "replace", "all?"], desc: "Surgical search/replace inside one file", risk: "medium" },
  delete_file:  { op: "/file/delete", args: ["path", "recursive?"], desc: "Delete a file or folder", risk: "high" },
  make_dir:     { op: "/file/mkdir", args: ["path"], desc: "Create a folder (recursive)", risk: "low" },
  move_path:    { op: "/file/move", args: ["from", "to"], desc: "Rename or move a file/folder", risk: "medium" },
  download_file:{ op: "/file/download", args: ["url", "path"], desc: "Download a file from an http(s) URL into the workspace (max 200MB). path must end with the right extension", risk: "medium" },
  search_code:  { op: "/grep", args: ["pattern", "path?"], desc: "Regex search across the codebase", risk: "low", readOnly: true },
  search_files: { op: "/search/files", args: ["query", "path?"], desc: "Find files by name", risk: "low", readOnly: true },

  // -------------------------------------------------------- commands -----
  run_command:  { op: "/exec", args: ["command", "cwd?"], desc: "Run a shell command to completion (2min timeout)", risk: "high" },
  start_process:{ op: "/proc/start", args: ["command", "cwd?"], desc: "Start a long-running process (dev server etc.) and stream output", risk: "high" },
  proc_output:  { op: "/proc/output", args: ["id", "since?"], desc: "Read new output from a started process", risk: "low", readOnly: true },
  stop_process: { op: "/proc/stop", args: ["id"], desc: "Stop a process the agent started", risk: "medium" },
  list_processes: { op: "/proc/list", args: [], desc: "List agent-started processes", risk: "low", readOnly: true },

  // ---------------------------------------------------------- terminals --
  terminal_create: { op: "/term/create", args: ["cwd?"], desc: "Open an interactive terminal session", risk: "medium" },
  terminal_write:  { op: "/term/write", args: ["id", "input"], desc: "Type a command into a terminal session", risk: "high" },
  terminal_output: { op: "/term/output", args: ["id", "since?"], desc: "Read new terminal output", risk: "low", readOnly: true },
  terminal_kill:   { op: "/term/kill", args: ["id"], desc: "Close a terminal session", risk: "medium" },

  // -------------------------------------------------------------- git ----
  git_status:  { op: "/git/status", args: ["cwd?"], desc: "Git status (porcelain)", risk: "low", readOnly: true },
  git_diff:    { op: "/git/diff", args: ["cwd?", "staged?"], desc: "Git diff of working tree", risk: "low", readOnly: true },
  git_log:     { op: "/git/log", args: ["cwd?", "limit?"], desc: "Recent commit history", risk: "low", readOnly: true },
  git_branch:  { op: "/git/branch", args: ["create?|name?", "cwd?"], desc: "List branches, or create/checkout one", risk: "medium" },
  git_stage:   { op: "/git/stage", args: ["path?", "cwd?"], desc: "Stage changes (git add)", risk: "medium" },

  // ------------------------------------------------------ checkpoints ----
  create_checkpoint: { op: "/checkpoint/create", args: ["label", "cwd?"], desc: "Snapshot the workspace (git commit or file snapshot) for rollback", risk: "medium" },
  list_checkpoints:  { op: "/checkpoint/list", args: [], desc: "List saved checkpoints", risk: "low", readOnly: true },
  rollback:          { op: "/checkpoint/rollback", args: ["id", "deleteNew?"], desc: "Restore the workspace to a checkpoint", risk: "high" },

  // ----------------------------------------------------- intelligence ----
  inspect_project: { op: "/project/inspect", args: ["cwd?"], desc: "Detect framework, deps, scripts, structure of the project", risk: "low", readOnly: true },
  system_info:     { op: "/sysinfo", args: [], desc: "PC system information", risk: "low", readOnly: true },

  // ------------------------------------------------- documents & audio ---
  make_docx: { op: "/make/docx", args: ["path", "content"], desc: "Create a Word (.docx) document. content = plain text; lines starting with '# ' become Heading 1, '## ' Heading 2", risk: "medium" },
  make_xlsx: { op: "/make/xlsx", args: ["path", "content?"], desc: "Create an Excel (.xlsx). Either give CSV-ish content (comma-separated rows) or sheets:[{name, rows:[[...]]}]", risk: "medium" },
  make_pptx: { op: "/make/pptx", args: ["path", "content?"], desc: "Create a PowerPoint (.pptx). content = blocks separated by blank lines; first line of each block = slide title, rest = bullets. Or slides:[{title,bullets}]. Slide previews render automatically for the popup", risk: "medium" },
  make_pdf: { op: "/make/pdf", args: ["path", "content"], desc: "Create a simple PDF document from plain text content", risk: "medium" },
  make_video: { op: "/make/video", args: ["path", "content?"], desc: "Create a narrated 1080p MP4 video from slides (ffmpeg + Bangla voice). path must end .mp4. slides:[{title,bullets,narration}] or content blocks; narration = spoken text per slide (auto-generated from title+bullets if omitted); resolution '1080p' (default) or '720p'; voice default bn-BD-NabanitaNeural (Bangladeshi female). ~30-40 words narration ≈ 10s per slide", risk: "medium" },
  make_audio: { op: "/make/audio", args: ["path", "text", "voice?"], desc: "Create a spoken .wav from text (Windows TTS, English voices)", risk: "medium" },
  tts_edge: { op: "/tts/edge", args: ["path", "text", "voice?"], desc: "Create a natural Bengali/English .mp3 via neural TTS. voice: 'bn-BD-NabanitaNeural' (Bangladeshi female, default), 'bn-BD-PradeepNeural' (Bangladeshi male), 'en-US-JennyNeural'", risk: "medium" },
  edge_voices: { op: "/voices/edge", args: [], desc: "List neural TTS voices for tts_edge", risk: "low", readOnly: true },
  office_preview: { op: "/office/preview", args: ["path"], desc: "Get rendered slide images of a .pptx (base64 PNGs) — visual preview", risk: "low", readOnly: true },
  list_voices: { op: "/list/voices", args: [], desc: "List installed Windows TTS voices for make_audio", risk: "low", readOnly: true },
  edit_audio: { op: "/edit/audio", args: ["op", "input", "output"], desc: "Edit a .wav file: op='trim' (+startSec,endSec), op='volume' (+factor 0.1-4), op='concat' (+inputs:[more wav paths])", risk: "medium" },
};

export const TOOL_NAMES = Object.keys(TOOLS);

export function toolPrompt() {
  const lines = TOOL_NAMES.map((name) => {
    const t = TOOLS[name];
    return `- ${name}(${t.args.join(", ")}) — ${t.desc}`;
  });
  return lines.join("\n");
}

// Validate + normalize a model tool call. Returns {tool, args} or {error}.
export function validateCall(call) {
  if (!call || typeof call !== "object") return { error: "action is not an object" };
  if (call.done !== undefined) return { done: true, summary: String(call.done || "").slice(0, 2000) };
  const name = call.tool;
  if (!TOOLS[name]) return { error: `unknown tool "${String(name).slice(0, 60)}" — must be one of the listed tools, or use {"done": "..."}` };
  const spec = TOOLS[name];
  const args = {};
  for (const a of spec.args) {
    const key = a.replace(/\?$/, "");
    if (call[key] !== undefined) args[key] = call[key];
    else if (!a.endsWith("?")) return { error: `${name} missing required arg "${key}"` };
  }
  for (const k of Object.keys(args)) {
    if (typeof args[k] === "string") args[k] = args[k].slice(0, 200000);
  }
  return { tool: name, args, spec };
}

export function riskLevel(name) { return TOOLS[name]?.risk || "medium"; }
export function isReadOnly(name) { return !!TOOLS[name]?.readOnly; }

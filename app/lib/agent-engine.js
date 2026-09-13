"use client";

// Autonomous agent engine (master §8/§10/§11) — a real plan → tool → observe
// → repeat loop. All LLM calls go through the app's own /api/chat proxy (BYOK
// preserved); all tools run through the Local PC Agent bridge. The model is
// untrusted input: every action is validated against the tool registry before
// the bridge ever sees it (TRD §20).

import { callModel } from "./agents";
import { validateCall, toolPrompt, riskLevel } from "./agent-tools";
import { pc } from "./pc";
import { useIde, newId } from "./ide-store";

const MAX_STEPS = 30;
const OBS_CAP = 3500; // per-observation char cap → context stays lean

function sysPrompt(workspace, extra) {
  return `You are the autonomous coding agent of a browser IDE, operating a local PC through a tool bridge.

WORKSPACE (the only place you may touch): ${workspace || "(not set)"}

TOOLS (call EXACTLY ONE per reply):
${toolPrompt()}

REPLY FORMAT — reply with ONLY a JSON object, no markdown, no prose:
{"thought": "<1-2 sentences reasoning>", "tool": "<tool name>", <tool args as JSON fields>}
When the whole task is finished (work done AND validated when possible), reply instead:
{"thought": "<why you're done>", "done": "<final summary for the user>"}
If you are blocked, reply: {"done": "BLOCKED: <what you need>"}

RULES:
- Plan first: run inspect_project / list_files before editing anything.
- **LIVE TODO LIST (mandatory for multi-step work):** your FIRST reply must be
  {"tool":"set_todo","items":[{"text":"<step>","status":"pending"}, ...]} with 3-8
  concrete steps. Then before starting a step send set_todo again marking it
  "doing", and when it finishes mark it "done" (or "failed"). The user watches
  this checklist tick off live — never skip it, never finish with stale statuses.
- WORK LIKE A HUMAN CODER, step by step — never dump a giant file in one shot:
  1. write_file the SKELETON only (imports + function stubs with pass/# TODO),
  2. fill in each function with its own edit_file call, one at a time (2-4 per file),
  3. after the file is complete, RUN it.
  The user watches every write in the popup — small visible steps feel real; one giant paste does not.
- Prefer edit_file (surgical search/replace) over write_file for existing files.
- MANDATORY CODE LOOP — for EVERY code file you create or change:
  1. write/edit the code,
  2. RUN it immediately (python/node <file>, or the project's build/test command),
  3. READ the output carefully — success AND failure both,
  4. if it errors or output is wrong: fix the code (edit_file / rewrite), then RUN again,
  5. repeat run→fix until the final run succeeds with correct output,
  6. ONLY then may you reply done (include the final verified output in your summary).
  Never claim done right after writing code. The engine REJECTS a done that has no run after the last code change.
- Before your FIRST modification of this task, call create_checkpoint so the user can roll back.
- Never touch files outside the workspace. Never print secrets (.env contents, keys).
- Keep each step small and observable. ${extra || ""}`;
}

// Extract the first JSON object from a reply that may be wrapped in prose/fences.
function parseAction(text) {
  if (!text) return { error: "empty model reply" };
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { error: "reply is not valid JSON — you MUST reply with only a JSON object" };
}

function obsText(result) {
  if (result == null) return "(no result)";
  if (typeof result !== "object") return String(result).slice(0, OBS_CAP);
  const { ok, error, ...rest } = result;
  let s = ok ? "OK" : `ERROR: ${error || "failed"}`;
  const parts = [];
  const trim = (v) => String(v ?? "").slice(0, OBS_CAP);
  if ("stdout" in rest || "stderr" in rest) {
    if (rest.stdout) parts.push("stdout:\n" + trim(rest.stdout));
    if (rest.stderr) parts.push("stderr:\n" + trim(rest.stderr));
    if (rest.exitCode !== undefined) parts.push("exitCode: " + rest.exitCode);
  } else if ("content" in rest) {
    parts.push("content (first " + OBS_CAP + " chars):\n" + trim(rest.content));
  } else if ("hits" in rest) {
    parts.push(`matches: ${rest.count}\n` + (rest.hits || []).slice(0, 25).map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n").slice(0, OBS_CAP));
  } else if ("entries" in rest) {
    parts.push((rest.entries || []).map((e) => (e.dir ? "[dir] " : "") + e.name).join("\n").slice(0, OBS_CAP));
  } else if ("files" in rest && Array.isArray(rest.files)) {
    parts.push(rest.files.slice(0, 50).join("\n").slice(0, OBS_CAP));
  } else {
    for (const [k, v] of Object.entries(rest)) {
      if (v == null) continue;
      parts.push(`${k}: ${typeof v === "object" ? trim(JSON.stringify(v)) : trim(v)}`);
    }
  }
  return (s + (parts.length ? "\n" + parts.join("\n") : "")).slice(0, OBS_CAP * 1.5);
}

export function createAgent() {
  let stopped = false;
  let paused = false;
  let runAbort = null; // aborted by stop() so an in-flight LLM call returns immediately

  const waitWhilePaused = async () => {
    while (paused && !stopped) await new Promise((r) => setTimeout(r, 400));
  };

  // Agent tool names are AI-facing; the bridge speaks HTTP routes. Map them.
  const TOOL_ROUTE = {
    list_files: "/file/list", read_file: "/file/read", write_file: "/file/write",
    edit_file: "/file/edit", delete_file: "/file/delete", make_dir: "/file/mkdir",
    move_path: "/file/move", download_file: "/file/download", search_code: "/grep", search_files: "/search/files",
    run_command: "/exec", start_process: "/proc/start", proc_output: "/proc/output",
    stop_process: "/proc/stop", list_processes: "/proc/list",
    terminal_create: "/term/create", terminal_write: "/term/write",
    terminal_output: "/term/output", terminal_kill: "/term/kill",
    git_status: "/git/status", git_diff: "/git/diff", git_log: "/git/log",
    git_branch: "/git/branch", git_stage: "/git/stage",
    create_checkpoint: "/checkpoint/create", list_checkpoints: "/checkpoint/list",
    rollback: "/checkpoint/rollback", inspect_project: "/project/inspect",
    system_info: "/sysinfo",
    make_docx: "/make/docx", make_xlsx: "/make/xlsx",
    make_pptx: "/make/pptx", make_audio: "/make/audio",
    make_pdf: "/make/pdf", list_voices: "/list/voices", edit_audio: "/edit/audio",
    make_video: "/make/video",
    tts_edge: "/tts/edge", edge_voices: "/voices/edge", office_preview: "/office/preview",
  };

  async function runTool(tool, args, task) {
    const store = useIde.getState();
    const route = TOOL_ROUTE[tool] || tool;
    // Live activity log inside the Agent Output popup (icon per action type)
    try {
      const { useCodeWindow } = await import("./code-window-store");
      const LOG_META = {
        list_files: ["📁", "list"], read_file: ["📄", "read"], write_file: ["✍️", "write"],
        edit_file: ["🔧", "edit"], delete_file: ["🗑️", "delete"], make_dir: ["📁", "create"],
        move_path: ["📦", "move"], download_file: ["🌐", "download"], search_code: ["🔍", "search"], search_files: ["🔍", "search"],
        run_command: ["⚙️", "exec"], start_process: ["🚀", "run"], stop_process: ["⏹️", "stop"],
        terminal_create: ["💻", "term"], terminal_write: ["⌨️", "term"], terminal_kill: ["⛔", "term"],
        git_status: ["🌿", "git"], git_diff: ["🌿", "git"], git_log: ["🌿", "git"],
        git_branch: ["🌿", "git"], git_stage: ["🌿", "git"],
        create_checkpoint: ["🔒", "ckpt"], rollback: ["⏪", "ckpt"],
        inspect_project: ["🔬", "analyze"], system_info: ["🖥️", "info"],
      };
      const [icon, kind] = LOG_META[tool] || ["🛠️", "tool"];
      const target = args.path || args.from || args.command || args.input || args.query || args.pattern || args.label || args.id || "";
      useCodeWindow.getState().addLog({
        icon, kind,
        text: `${tool} — ${String(target).slice(0, 120) || "(workspace)"}`,
      });
    } catch {}
    const r = await pc(route, args);
    const text = obsText(r);
    const ok = !!(r && r.ok);
    store.pushActivity({ actor: "agent", action: tool, resource: JSON.stringify(args).slice(0, 140), result: ok ? "ok" : String(r?.error || "error").slice(0, 120), risk: riskLevel(tool) });
    // Every file the agent creates/edits pops into the Code Output Window so
    // the user can watch the code being written in real time. This covers
    // write_file/edit_file AND all media generators (docx/xlsx/pptx/pdf/audio
    // — those return binary files, so we log them as file entries with a note
    // instead of text content).
    if (ok && args && (args.path || args.output) && ["write_file", "edit_file", "make_docx", "make_xlsx", "make_pptx", "make_pdf", "make_audio", "edit_audio", "delete_file", "move_path", "make_video", "tts_edge"].includes(tool)) {
      try {
        const { useCodeWindow } = await import("./code-window-store");
        const cw = useCodeWindow.getState();
        const filePath = args.output || args.path;
        if (tool === "write_file" || tool === "edit_file") {
          const content = tool === "write_file" ? String(args.content ?? "") : (await readFileSafe(args.path)) ?? "";
          // Type the code into the popup live — like a real coder writing it,
          // instead of pasting the whole file at once.
          cw.streamFile({ path: args.path, content });
        } else if (tool === "delete_file") {
          cw.addLog({ icon: "🗑️", kind: "delete", text: `deleted ${args.path}` });
        } else if (tool === "move_path") {
          cw.addLog({ icon: "📦", kind: "move", text: `${args.from} → ${filePath}` });
        } else {
          // binary/office output — register as a file card with metadata
          const ext = (filePath.split(".").pop() || "").toLowerCase();
          const KIND_LABEL = { docx: "Word ডকুমেন্ট", xlsx: "Excel স্প্রেডশিট", pptx: "PowerPoint স্লাইড", pdf: "PDF ডকুমেন্ট", wav: "অডিও (TTS)", mp3: "অডিও (বাংলা কণ্ঠ)", mp4: "ভিডিও (MP4)" };
          cw.addFile({ path: filePath, content: `// ${KIND_LABEL[ext] || ext.toUpperCase()} — বাইনারি ফাইল তৈরি হয়েছে\n// খুলতে: workspace-এর ভেতরে এই ফাইলটি আছে (${filePath})` });
        }
      } catch {}
    }
    if (ok && tool === "run_command" && args.command) {
      // Files written via shell one-liners (echo > file, cat > file, copy …)
      // also land in the popup: after the command, check the workspace for
      // files newer than this task's start and refresh their cards.
      try {
        const { useCodeWindow } = await import("./code-window-store");
        const cw = useCodeWindow.getState();
        const m = String(args.command).match(/[\w.\-\\/]+\.(js|ts|jsx|tsx|html|css|json|md|py|txt|wav|mp4|docx|xlsx|pptx|pdf)/i);
        if (m && / (>|>>|Out-File|Set-Content) /.test(" " + args.command)) {
          const hint = m[0].replace(/[\\/]+/g, "\\");
          cw.addLog({ icon: "📝", kind: "write", text: `shell wrote → ${hint} (verify via read_file)` });
        }
      } catch {}
    }
    if (task) {
      // read the LIVE task record from the store (the local `task` const is stale)
      const live = useIde.getState().tasks.find((t) => t.id === task.id);
      const isCmd = ["run_command", "start_process", "terminal_write", "stop_process", "terminal_kill"].includes(tool);
      const isFile = ["write_file", "edit_file", "delete_file", "move_path", "make_dir"].includes(tool);
      if (isCmd && live) { store.updateTask(task.id, { commands: [...live.commands, args.command || args.input || tool].slice(-30) }); task.commands = [...(task.commands || []), args.command || args.input || tool].slice(-30); }
      if (isFile && ok && live) { store.updateTask(task.id, { files: [...new Set([...live.files, args.path || args.from || ""])].slice(-40) }); task.files = [...new Set([...(task.files || []), args.path || args.from || ""])].slice(-40); }
    }
    return { ok, text };
  }

  // Wire an AI write/edit into the IDE's change-review flow (master §14).
  function recordAiChange(tool, args, before, after, taskId) {
    const store = useIde.getState();
    const path = args.path;
    if (!path) return;
    store.addAiChange({
      id: newId(), path, before, after: after ?? null, reason: args.reason || "(see task)", taskId, at: new Date().toISOString(), status: "applied",
      tool,
    });
  }

  async function readFileSafe(path) {
    const r = await pc("/file/read", { path });
    return r?.ok ? r.content : null;
  }

  // Normalize a model-supplied todo list into a safe UI shape.
  function normalizeTodos(items) {
    const STATUSES = new Set(["pending", "doing", "done", "failed"]);
    return (Array.isArray(items) ? items : [])
      .slice(0, 12)
      .map((it) => ({
        text: String(it?.text || "").slice(0, 200),
        status: STATUSES.has(it?.status) ? it.status : "pending",
      }))
      .filter((it) => it.text);
  }

  /**
   * Run one autonomous task end-to-end.
   * cfg: { apiBaseUrl, apiKey, apiModel, workspace, goal, temperature?, onStatus? }
   *   onStatus(text) → live human-readable progress for the chat bubble.
   * Returns the task record.
   */
  async function run(cfg, onEvent = () => {}) {
    stopped = false; paused = false;
    runAbort = new AbortController();
    const store = useIde.getState();
    const task = {
      id: newId(), title: String(cfg.goal).slice(0, 90), status: "planning",
      steps: [], error: null, startedAt: new Date().toISOString(), finishedAt: null,
      files: [], commands: [], summary: null, todos: [],
    };
    store.addTask(task);
    store.pushActivity({ actor: "user", action: "task start", resource: task.title, result: "queued", risk: "low" });
    cfg.onStatus?.("📋 টাস্ক নেওয়া হলো — পরিকল্পনা করছি…");

    // The local `task` const is only the initial shape — every status/files/
    // todos update lands on the STORE copy. Callers must receive the LIVE
    // record, never the stale local object.
    const getLive = () => useIde.getState().tasks.find((t) => t.id === task.id) || task;

    const messages = [
      { role: "system", content: sysPrompt(cfg.workspace, cfg.extra) },
      { role: "user", content: `TASK: ${cfg.goal}\n\nBegin. Inspect before you edit, checkpoint before your first edit. Then for every code change follow the MANDATORY CODE LOOP: write → run → read output → fix if wrong → run again → only say done after a successful final run.` },
    ];

    // ---- self-verification enforcement (Mandatory Code Loop) ----
    // If the agent wrote/edited real code but never ran anything afterwards,
    // a "done" is bounced back with a verification demand (max 2 nudges).
    const CODE_EXT = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "go", "rs", "java", "c", "cpp", "cs", "rb", "php", "swift", "kt", "sh", "ps1", "bat"]);
    let codeEdited = false;
    let ranAfterEdit = false;
    let verifyNudges = 0;

    let step = 0;
    let lastFail = 0;
    try {
      while (step < MAX_STEPS) {
        if (stopped) { finish("cancelled"); return getLive(); }
        await waitWhilePaused();
        if (stopped) { finish("cancelled"); return getLive(); }
        step++;

        store.updateTask(task.id, { status: "running", steps: [...task.steps, { title: `Step ${step}`, status: "running", detail: "thinking…", tools: 0, startedAt: Date.now() }] });
        onEvent({ type: "step", step });

        let reply;
        try {
          reply = await callModel({
            apiBaseUrl: cfg.apiBaseUrl, apiKey: cfg.apiKey, apiModel: cfg.apiModel,
            messages, temperature: cfg.temperature ?? 0.3, maxTokens: 4000,
            signal: runAbort?.signal,
          });
        } catch (e) {
          // user pressed Stop → finish cleanly, no retry
          if (e?.name === "AbortError" || stopped) { finish("cancelled"); return getLive(); }
          // transient provider failure → retry the step a few times
          lastFail++;
          if (lastFail >= 3) { store.updateTask(task.id, { status: "failed", error: "model unreachable: " + String(e.message || e).slice(0, 200), finishedAt: new Date().toISOString() }); finish("failed"); return getLive(); }
          await new Promise((r) => setTimeout(r, 1200 * lastFail));
          store.updateTaskStep(task.id, step - 1, { status: "retrying", detail: "model retry…" });
          continue;
        }
        lastFail = 0;

        const usage = reply?.usage;
        if (usage && cfg.onUsage) { try { cfg.onUsage(cfg.apiModel, usage); } catch {} }

        // Free providers often return an EMPTY reply (timeout mid-reasoning).
        // Treat it like a transient provider failure — retry WITHOUT burning
        // a step, up to 4 times.
        if (!reply.content || !String(reply.content).trim()) {
          lastFail++;
          if (lastFail >= 4) {
            store.updateTask(task.id, { status: "failed", error: "প্রোভাইডার ৪ বার খালি উত্তর দিয়েছে — মডেল/প্রোভাইডার বদলে আবার চেষ্টা করুন", finishedAt: new Date().toISOString() });
            finish("failed");
            return getLive();
          }
          await new Promise((r) => setTimeout(r, 1500 * lastFail));
          store.updateTaskStep(task.id, step - 1, { status: "retrying", detail: `খালি উত্তর — retry ${lastFail}/4…` });
          step--;
          continue;
        }

        const action = parseAction(reply.content);
        if (action.error) {
          lastFail++;
          if (lastFail >= 4) {
            store.updateTask(task.id, { status: "failed", error: "মডেল বারবার ভুল ফরম্যাটে জবাব দিচ্ছে — এই মডেলটি agent কাজের জন্য দুর্বল, ভিন্ন মডেলে চেষ্টা করুন", finishedAt: new Date().toISOString() });
            finish("failed");
            return getLive();
          }
          messages.push({ role: "assistant", content: String(reply.content).slice(0, 500) });
          messages.push({ role: "user", content: `PROTOCOL ERROR: ${action.error}\nReply with ONLY the JSON object, nothing else.` });
          store.updateTaskStep(task.id, step - 1, { status: "retrying", detail: action.error + ` (retry ${lastFail}/4)` });
          step--;
          continue;
        }
        lastFail = 0;

        if (action.done !== undefined) {
          // Verification gate: never accept "done" right after code edits that
          // were never run. Bounce back with a demand to run + verify (≤2 nudges).
          if (codeEdited && !ranAfterEdit && verifyNudges < 2 && step < MAX_STEPS - 1) {
            verifyNudges++;
            messages.push({ role: "assistant", content: JSON.stringify(action) });
            messages.push({ role: "user", content: `VERIFICATION REQUIRED: you changed code but never RAN it afterwards. Run the file/feature (python/node <file> or the project test command), READ the output, fix anything wrong, and only then reply done WITH the final verified output. If there is truly nothing to execute, run a syntax check (e.g. python -m py_compile <file>) as verification.` });
            store.updateTaskStep(task.id, step - 1, { status: "retrying", detail: "🔒 সেলফ-ভেরিফিকেশন বাধ্যতামূলক — কোড চালিয়ে প্রমাণ দিতে হবে" });
            try {
              const { useCodeWindow } = await import("./code-window-store");
              useCodeWindow.getState().addLog({ icon: "🔒", kind: "ckpt", text: "ভেরিফিকেশন গেট: কোড চালিয়ে প্রমাণ ছাড়া 'শেষ' গৃহীত হবে না" });
            } catch {}
            continue;
          }
          messages.push({ role: "assistant", content: JSON.stringify(action) });
          store.updateTaskStep(task.id, step - 1, { status: "done", detail: String(action.done).slice(0, 300) });
          finish("completed", String(action.done));
          return getLive();
        }

        const call = validateCall(action);
        if (call.error) {
          messages.push({ role: "assistant", content: JSON.stringify(action) });
          messages.push({ role: "user", content: `TOOL CALL REJECTED: ${call.error}\nReply with a corrected JSON object.` });
          store.updateTaskStep(task.id, step - 1, { status: "failed", detail: call.error });
          continue;
        }

        // set_todo is handled INSIDE the engine (UI state, not a bridge op):
        // publish/update the live checklist the user watches tick off.
        if (call.tool === "set_todo") {
          const todos = normalizeTodos(call.args.items);
          task.todos = todos;
          store.updateTask(task.id, { todos });
          // mirror into the persistent right-hand panel (visible in chat view)
          store.setLiveTodos(todos, task.title, true);
          onEvent({ type: "todo", todos });
          const doneN = todos.filter((t) => t.status === "done").length;
          cfg.onStatus?.(`📝 টাস্ক লিস্ট: ${doneN}/${todos.length} সম্পন্ন`);
          store.updateTaskStep(task.id, step - 1, { status: "done", detail: `todo ${doneN}/${todos.length}`, tools: 1 });
          messages.push({ role: "assistant", content: JSON.stringify(action) });
          messages.push({ role: "user", content: `TODO LIST RECORDED (${todos.length} items, ${doneN} done). Continue with the next single JSON action.` });
          continue;
        }

        // snapshot before first write-ish change of the task for review diffs
        const before = ["write_file", "edit_file", "delete_file", "move_path"].includes(call.tool)
          ? await readFileSafe(call.args.path || call.args.from) : null;

        store.updateTaskStep(task.id, step - 1, { detail: `${call.tool} ${JSON.stringify(call.args).slice(0, 120)}`, tools: 1 });
        onEvent({ type: "tool", tool: call.tool, args: call.args });
        // Human-readable live status for the chat bubble
        const STATUS_TEXT = {
          list_files: "📁 ফোল্ডার দেখছি…", read_file: "📄 ফাইল পড়ছি…",
          write_file: `✍️ লিখছি: ${String(call.args.path || "").split(/[\\/]/).pop()}`,
          edit_file: `🔧 এডিট করছি: ${String(call.args.path || "").split(/[\\/]/).pop()}`,
          make_dir: `📁 ফোল্ডার বানাচ্ছি: ${String(call.args.path || "").split(/[\\/]/).pop()}`,
          delete_file: "🗑️ ডিলিট করছি…", move_path: "📦 মুভ/রিনেম করছি…",
          run_command: `⚙️ কমান্ড চালাচ্ছি: ${String(call.args.command || "").slice(0, 50)}`,
          start_process: "🚀 প্রসেস চালু করছি…", search_code: "🔍 কোডে খুঁজছি…",
          create_checkpoint: "🔒 checkpoint নিচ্ছি…", git_status: "🌿 git status দেখছি…",
          inspect_project: "🔬 প্রজেক্ট অ্যানালাইজ করছি…",
        };
        cfg.onStatus?.(STATUS_TEXT[call.tool] || `🛠️ ${call.tool}…`);

        const res = await runTool(call.tool, call.args, task);
        if (call.tool === "write_file" || call.tool === "edit_file") {
          if (res.ok) {
            const after = call.tool === "write_file" ? String(call.args.content ?? "") : await readFileSafe(call.args.path);
            recordAiChange(call.tool, call.args, before, after, task.id);
          }
          useIde.getState().refreshTree();
        }
        // Mandatory Code Loop tracking: a successful run after the last code
        // edit is what makes a later "done" acceptable.
        const editedPath = String(call.args.path || call.args.from || "");
        if ((call.tool === "write_file" || call.tool === "edit_file") && res.ok && CODE_EXT.has((editedPath.split(".").pop() || "").toLowerCase())) {
          codeEdited = true;
          ranAfterEdit = false;
        }
        if ((call.tool === "run_command" || call.tool === "start_process") && res.ok) {
          ranAfterEdit = true;
        }
        store.updateTaskStep(task.id, step - 1, { status: res.ok ? "done" : "failed", result: res.text.slice(0, 4000) });

        messages.push({ role: "assistant", content: JSON.stringify(action) });
        messages.push({ role: "user", content: `TOOL RESULT (${call.tool}):\n${res.text}\n\nContinue with the next single JSON action, or {"done": "..."}. Remember: if you changed code, run it and confirm the output before done.` });
      }
      store.updateTask(task.id, { status: "failed", error: "reached max steps (" + MAX_STEPS + ")", finishedAt: new Date().toISOString() });
      finish("failed");
      return getLive();
    } finally {
      // no dangling state
    }

    function finish(status, summary) {
      // Mutate the LOCAL task too — run() returns this object, and callers
      // must see the final status even if a store lookup misses.
      task.status = status;
      task.summary = summary ?? null;
      task.finishedAt = new Date().toISOString();
      if (status === "completed" && Array.isArray(task.todos)) {
        task.todos = task.todos.map((t) => (t.status === "pending" || t.status === "doing" ? { ...t, status: "done" } : t));
      }
      // On a completed run, any checklist items the model forgot to tick are
      // marked done — the task IS done; stale checkboxes mislead the user.
      const live = useIde.getState().tasks.find((t) => t.id === task.id);
      if (status === "completed" && live?.todos?.length) {
        store.updateTask(task.id, { todos: live.todos.map((t) => (t.status === "pending" || t.status === "doing" ? { ...t, status: "done" } : t)) });
      }
      onEvent({ type: "todo", todos: task.todos || [] });
      // panel: mark the run as finished (checklist stays visible, spinner stops)
      if (Array.isArray(task.todos) && task.todos.length) store.setLiveTodos(task.todos, task.title, false);
      store.updateTask(task.id, { status, summary: summary ?? null, finishedAt: new Date().toISOString() });
      try { store.pushTaskHistory({ id: task.id, title: task.title, status, summary: summary ?? null, startedAt: task.startedAt, finishedAt: new Date().toISOString(), files: task.files || [], commands: task.commands || [], todos: task.todos || [] }); } catch {}
      store.pushActivity({ actor: "agent", action: "task " + status, resource: task.title, result: status, risk: "low" });
      if (status === "completed") cfg.onStatus?.("✅ কাজ শেষ!");
      else if (status === "failed") cfg.onStatus?.("❌ কাজ ব্যর্থ হয়েছে");
      else cfg.onStatus?.("⏹️ বন্ধ করা হয়েছে");
      onEvent({ type: "finished", status, summary });
    }
  }

  return {
    run,
    stop: () => {
      stopped = true;
      paused = false;
      try { runAbort?.abort(); } catch {}
    },
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    get paused() { return paused; },
    get stopped() { return stopped; },
  };
}

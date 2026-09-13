"use client";

// Agent Panel (master §28/§29/§30/§6 / UI spec §6/§7/§11) — task list with
// live steps, agent console input, START/PAUSE/STOP/RETRY controls, approval
// modal for bridge permission requests, FULL ACCESS toggle, PC status.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play, Pause, Square, RotateCcw, Loader2, CheckCircle2, XCircle, CircleDashed,
  Terminal as TerminalIcon, ShieldCheck, ShieldAlert, Lock, Unlock, ShieldQuestion,
  ChevronDown, ChevronRight, MonitorSmartphone,
} from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde, newId, TASK_STATUS } from "@/lib/ide-store";
import { useStore } from "@/lib/store";
import ChangesPanel from "./ChangesPanel";

const STATUS_META = {
  planning: { icon: Loader2, color: "#8b93a7", spin: true },
  running: { icon: Loader2, color: "#38bdf8", spin: true },
  waiting: { icon: ShieldQuestion, color: "#f59e0b" },
  testing: { icon: Loader2, color: "#38bdf8", spin: true },
  fixing: { icon: Loader2, color: "#f59e0b", spin: true },
  paused: { icon: Pause, color: "#f59e0b" },
  completed: { icon: CheckCircle2, color: "#22c55e" },
  failed: { icon: XCircle, color: "#ef4444" },
  cancelled: { icon: CircleDashed, color: "#8b93a7" },
  queued: { icon: CircleDashed, color: "#8b93a7" },
};

// §10 "intelligence" presets — curated instructions the general agent executes
// using its existing tools (inspect_project, read, grep, write, edit, run_command).
const SKILLS = [
  { icon: "🔬", label: "Analyze", hint: "Project structure + dependencies + architecture overview", prompt: "Analyze this project: run inspect_project, list key files, and summarize the architecture, entry points, and dependencies. Then write a short ARCHITECTURE.md." },
  { icon: "🧹", label: "Quality", hint: "Code review across the project", prompt: "Act as a strict code-quality reviewer: scan the main source files, identify code smells, duplication, dead code, and weak error handling. List concrete fixes with file:line, then apply the safe ones and re-run any build/tests to verify nothing broke." },
  { icon: "🛡️", label: "Security", hint: "Security review", prompt: "Security-review this project: look for secrets committed, unsafe input handling (injection, path traversal), unvalidated URLs/SSRF, XSS in rendered HTML, and insecure defaults. Report findings by severity (file:line + why + fix), then apply the low-risk fixes and verify." },
  { icon: "🐞", label: "Fix errors", hint: "Find & fix build/test errors", prompt: "Run the build and tests, capture every error, and fix them one by one. After each fix, re-run to confirm. Repeat until build and tests pass; then report what you changed." },
  { icon: "🧪", label: "Add tests", hint: "Generate & run tests", prompt: "Add a sensible automated test suite for the core modules: inspect the code, write unit tests using the project's framework (or a minimal one if none), run them, and fix failures until they pass." },
  { icon: "♻️", label: "Refactor", hint: "Safe refactor", prompt: "Refactor the most complex/hard-to-read module for clarity without changing behavior: extract functions, improve names, reduce duplication. Run build/tests before and after to prove behavior is unchanged." },
  { icon: "📖", label: "Docs", hint: "Generate documentation", prompt: "Write documentation for this project: a README with setup + usage, and doc comments for the main public functions. Read the code first, base everything on what's actually there, and don't invent APIs." },
];
const MODES = [
  { key: "ask", label: "Ask", desc: "প্রতিটা লেখা/কমান্ডে অনুমতি চাইবে", icon: Lock },
  { key: "safe", label: "Safe", desc: "পড়া অটো, লেখা/কমান্ডে অনুমতি চাইবে", icon: ShieldCheck },
  { key: "auto", label: "Full Access", desc: "সব অটো — workspace-এর ভেতরে (নিজের দায়িত্বে)", icon: Unlock },
];

export default function AgentPanel({ workspace, agentRef, onRunCommand }) {
  const tasks = useIde((s) => s.tasks);
  const taskHistory = useIde((s) => s.taskHistory);
  const clearTaskHistory = useIde((s) => s.clearTaskHistory);
  const activity = useIde((s) => s.activity);
  const bridge = useIde((s) => s.bridge);
  const setBridge = useIde((s) => s.setBridge);
  const pending = useIde((s) => s.pendingApprovals);
  const setPending = useIde((s) => s.setPending);
  const aiPending = useIde((s) => s.aiChanges.filter((c) => c.status === "applied").length);
  const pushActivity = useIde((s) => s.pushActivity);
  const setBottomTab = useIde((s) => s.setBottomTab);
  const refreshTree = useIde((s) => s.refreshTree);

  const store = useStore();
  const [goal, setGoal] = useState("");
  const consoleRef = useRef(null);
  const textareaFocus = () => { try { consoleRef.current?.focus(); } catch {} };
  const [rightTab, setRightTab] = useState("agent"); // agent | changes
  const [runningId, setRunningId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const agentRefLocal = useRef(agentRef?.current ?? null);
  const streamRef = useRef(null);
  streamRef.current = streamRef.current || [];

  // bridge heartbeat + pending approvals poll (PRD §6.2 / UI spec §3)
  useEffect(() => {
    let alive = true;
    let wsSet = false; // set workspace once per mount (avoid audit spam)
    const beat = async () => {
      const [s, p] = await Promise.all([pc("status"), pc("pending")]);
      if (!alive) return;
      setBridge({
        connected: !!s?.ok, workspace: s?.workspace || workspace || "",
        mode: s?.mode || "ask", pending: s?.pending || 0,
      });
      setPending(p?.pending || []);
      if (workspace && !wsSet) {
        wsSet = true;
        await pc("/workspace", { path: workspace }).catch(() => {});
      }
    };
    beat();
    const iv = setInterval(beat, 2500);
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const setMode = async (mode) => {
    const r = await pc("/mode", { mode });
    if (r?.ok) { setBridge({ mode }); pushActivity({ actor: "user", action: "permission mode", resource: mode, result: "ok", risk: "low" }); }
  };

  const approve = async (id, allow) => {
    await pc("/approve", { id, allow });
    setPending((list) => list.filter((p) => p.id !== id));
    pushActivity({ actor: "user", action: allow ? "approved" : "denied", resource: id, result: allow ? "ok" : "denied", risk: "low" });
  };

  // "Allow for this task": switch bridge to safe mode (reads auto, writes ask)
  // for the rest of the task — the user can flip back anytime (spec-5 §7).
  const allowForTask = async () => {
    await pc("/mode", { mode: "safe" });
    setBridge({ mode: "safe" });
    for (const p of pending) await pc("/approve", { id: p.id, allow: true });
    setPending([]);
    pushActivity({ actor: "user", action: "approved (for this task)", resource: "mode → safe", result: "ok", risk: "low" });
  };

  const decide = async (allowAll) => {
    const list = pending;
    for (const p of list) await pc("/approve", { id: p.id, allow: allowAll });
    setPending([]);
  };

  const run = async () => {
    if (!goal.trim() || runningId) return;
    const cfg = {
      apiBaseUrl: store.apiBaseUrl, apiKey: store.apiKey, apiModel: store.apiModel,
      workspace: bridge.workspace || workspace, goal: goal.trim(),
      onUsage: (modelId, usage) => {
        try {
          store.recordUsage(modelId, {
            promptTokens: usage?.promptTokens, completionTokens: usage?.completionTokens,
          }, 0);
        } catch {}
      },
    };
    const localProvider = ["11434", "ollama", "1234", "lm-studio", "localhost", "127.0.0.1"].some((s) => (cfg.apiBaseUrl || "").includes(s));
    if (!cfg.apiKey && !localProvider) {
      pushActivity({ actor: "user", action: "no API key", resource: "settings", result: "configure a provider in Settings first", risk: "low" });
      return;
    }
    const { createAgent } = await import("@/lib/agent-engine");
    const agent = createAgent();
    agentRefLocal.current = agent;
    setRunningId(newId());
    setGoal("");
    setBottomTab("output");
    await agent.run(cfg, (ev) => {
      if (ev.type === "tool" && /dev server|start_process/.test(ev.tool || "")) refreshTree();
    }).finally(() => {
      setRunningId(null); setPaused(false);
      refreshTree();
    });
  };

  const stop = () => { agentRefLocal.current?.stop?.(); setRunningId(null); setPaused(false); };
  const pause = () => {
    const a = agentRefLocal.current;
    if (!a) return;
    if (a.paused) { a.resume(); setPaused(false); } else { a.pause(); setPaused(true); }
  };

  return (
    <div className="flex h-full flex-col text-[var(--txt)]">
      {/* header: PC access status (UI spec §11) */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <MonitorSmartphone size={14} className="text-[var(--accent)]" />
        <span className="text-[12px] font-semibold">PC Agent</span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] ${bridge.connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${bridge.connected ? "bg-emerald-400" : "bg-red-400"}`} />
          {bridge.connected ? "Connected" : "Offline — start agent-bridge"}
        </span>
        <span className="ml-auto truncate text-[10.5px] text-[var(--txt-dim)]" title={bridge.workspace}>
          {bridge.workspace?.split(/[\\/]/).pop() || "no workspace"}
        </span>
      </div>

      {/* right-panel tabs: Agent console | AI Changes review */}
      <div className="flex gap-1 border-b border-white/5 px-3 py-1.5">
        {[
          { k: "agent", label: "Console" },
          { k: "changes", label: `Changes${aiPending ? ` (${aiPending})` : ""}` },
          { k: "history", label: `History${taskHistory?.length ? ` (${taskHistory.length})` : ""}` },
        ].map((t) => (
          <button key={t.k} onClick={() => setRightTab(t.k)}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium ${rightTab === t.k ? "bg-white/10 text-[var(--txt)]" : "text-[var(--txt-dim)] hover:bg-white/5"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {rightTab === "history" && (
        <div className="min-h-0 flex-1 overflow-auto p-3 text-[12px]">
          {!taskHistory?.length && <p className="text-[var(--txt-dim)]">এখনো কোনো agent টাস্ট সম্পন্ন হয়নি — টাস্ট শেষ হলে এখানে history জমা হবে (reload-ও থাকে)।</p>}
          {(taskHistory || []).map((h, i) => (
            <div key={h.id || i} className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0">{h.status === "completed" ? "✅" : h.status === "failed" ? "❌" : "⏹"}</span>
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <button onClick={() => { setGoal(h.title); setRightTab("agent"); }} title="আবার চালান" className="shrink-0 rounded px-1.5 py-0.5 text-[10px] hover:bg-white/10">↻ Retry</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-[var(--txt-dim)]">
                <span>{new Date(h.finishedAt || h.startedAt || Date.now()).toLocaleString()}</span>
                {h.files?.length ? <span>📄 {h.files.length}</span> : null}
                {h.commands?.length ? <span>⚙ {h.commands.length}</span> : null}
                {h.todos?.length ? <span>☑ {h.todos.filter((t) => t.status === "done").length}/{h.todos.length}</span> : null}
              </div>
              {h.summary && <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: "var(--txt-dim)" }}>{h.summary}</p>}
            </div>
          ))}
          {taskHistory?.length > 0 && (
            <button onClick={() => clearTaskHistory()} className="mt-1 rounded px-2 py-1 text-[11px] text-[var(--txt-dim)] hover:bg-white/5">Clear history</button>
          )}
        </div>
      )}

      {rightTab === "changes" ? (
        <div className="min-h-0 flex-1">
          <ChangesPanel onOpenFile={(p, n, c, o) => {
            // Wire "Open in editor" for real: create/select the tab and
            // switch the center pane to the editor.
            const ide = useIde.getState();
            ide.openTab(p, n, c ?? "", { keepBuffer: !!o?.keepBuffer });
            ide.setCenterTab("editor");
          }} />
        </div>
      ) : (
      <>
      {/* full access / modes */}
      <div className="flex gap-1 border-b border-white/5 px-3 py-2">
        {MODES.map((m) => (
          <button key={m.key} title={m.desc} onClick={() => setMode(m.key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] ${
              bridge.mode === m.key ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 text-[var(--txt-dim)] hover:bg-white/10"
            }`}>
            <m.icon size={12} /> {m.label}
          </button>
        ))}
      </div>

      {/* approval modal (inline, UI spec §7) */}
      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mx-3 mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-400">
              <ShieldAlert size={13} /> Agent permission request ({pending.length})
            </p>
            {pending.slice(0, 3).map((p) => (
              <div key={p.id} className="mt-1.5 rounded-lg bg-black/25 p-2">
                <p className="text-[11px] text-[var(--txt-dim)]">{p.kind}</p>
                <p className="break-all font-mono text-[11.5px]">{p.summary}</p>
              </div>
            ))}
            <div className="mt-2 flex gap-1.5">
              <button className="flex-1 rounded-lg bg-emerald-500/20 px-2 py-1.5 text-[11.5px] text-emerald-400 hover:bg-emerald-500/30" onClick={() => decide(true)}>Allow all</button>
              <button className="flex-1 rounded-lg bg-sky-500/15 px-2 py-1.5 text-[11.5px] text-sky-400 hover:bg-sky-500/25" title="Reads auto-allowed; writes still ask — safest middle ground" onClick={allowForTask}>Allow for task</button>
              <button className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-[11.5px] hover:bg-white/20" onClick={() => { if (pending[0]) approve(pending[0].id, true); }}>Allow once</button>
              <button className="flex-1 rounded-lg bg-red-500/15 px-2 py-1.5 text-[11.5px] text-red-400 hover:bg-red-500/25" onClick={() => decide(false)}>Deny</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* console input */}
      <div className="border-b border-white/5 p-3">
        <div className="mb-1.5 flex flex-wrap gap-1">
          {SKILLS.map((sk) => (
            <button key={sk.label} title={sk.hint} onClick={() => { setGoal(sk.prompt); textareaFocus?.(); }}
              className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--txt-dim)] hover:bg-white/10 hover:text-[var(--txt)]"
              style={{ border: "1px solid var(--border)" }}>
              {sk.icon} {sk.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-2 focus-within:border-[var(--accent)]/60">
          <textarea ref={consoleRef}
            value={goal} onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); }}
            rows={2} placeholder="Describe a task for the agent… (Ctrl+Enter to run)&#10;e.g. Fix all build errors and run tests"
            className="w-full resize-none bg-transparent text-[12.5px] outline-none placeholder:text-[var(--txt-dim)]"
          />
          <div className="mt-1 flex items-center gap-1.5">
            {runningId ? (
              <>
                <button onClick={pause} className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11.5px] text-amber-400 hover:bg-amber-500/30">
                  {paused ? <Play size={11} /> : <Pause size={11} />} {paused ? "Resume" : "Pause"}
                </button>
                <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1 text-[11.5px] text-red-400 hover:bg-red-500/25">
                  <Square size={11} /> Stop
                </button>
                <span className="ml-auto flex items-center gap-1 text-[10.5px] text-[var(--txt-dim)]">
                  <Loader2 size={11} className="animate-spin" /> agent working…
                </span>
              </>
            ) : (
              <>
                <button onClick={run} className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1 text-[11.5px] font-medium text-black hover:opacity-90">
                  <Play size={11} /> Run task
                </button>
                <span className="ml-auto text-[10px] text-[var(--txt-dim)]">{store.apiModel || "configure model in Settings"}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* task list */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!tasks.length && (
          <p className="px-1 text-[12px] leading-relaxed text-[var(--txt-dim)]">
            No agent tasks yet. The agent can inspect the project, edit files, run commands, use git and fix errors — every step shows up here in real time.
          </p>
        )}
        {tasks.map((t) => {
          // Defensive guards: a task written by an older engine version may be
          // missing fields — never let the panel crash the whole IDE.
          if (!t || typeof t !== "object" || !t.id) return null;
          const steps = Array.isArray(t.steps) ? t.steps : [];
          const files = Array.isArray(t.files) ? t.files : [];
          const commands = Array.isArray(t.commands) ? t.commands : [];
          const meta = STATUS_META[t.status] || STATUS_META.queued;
          const Icon = meta?.icon || CircleDashed;
          const open = openTask === t.id;
          return (
            <div key={t.id} className="mb-2 overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04]" onClick={() => setOpenTask(open ? null : t.id)}>
                <Icon size={14} style={{ color: meta.color }} className={meta.spin ? "animate-spin" : ""} />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
                <span className="shrink-0 text-[10.5px] text-[var(--txt-dim)]">
                  {steps.length} steps{files.length ? ` · ${files.length} files` : ""}
                </span>
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <AnimatePresence>
                {open && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="border-t border-white/5 px-3 py-2 text-[11.5px]">
                      {t.error && <p className="mb-1.5 rounded bg-red-500/10 p-1.5 text-red-400">{t.error}</p>}
                      {t.summary && <p className="mb-1.5 rounded bg-emerald-500/10 p-1.5 text-emerald-400">{t.summary}</p>}
                      {Array.isArray(t.todos) && t.todos.length > 0 && (
                        <div className="mb-2 space-y-1 rounded-lg bg-white/[0.03] p-2">
                          {t.todos.map((td, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              {td.status === "done" ? <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-emerald-400" />
                                : td.status === "doing" ? <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin text-sky-400" />
                                : td.status === "failed" ? <XCircle size={11} className="mt-0.5 shrink-0 text-red-400" />
                                : <CircleDashed size={11} className="mt-0.5 shrink-0 text-[var(--txt-dim)]" />}
                              <span className={td.status === "done" ? "line-through opacity-60" : ""}>{td.text}</span>
                            </div>
                          ))}
                          <p className="text-[10px] text-[var(--txt-dim)]">{t.todos.filter((x) => x.status === "done").length}/{t.todos.length} সম্পন্ন</p>
                        </div>
                      )}
                      {steps.map((s, i) => (
                        <div key={i} className="mb-1 flex items-start gap-2">
                          <span className="mt-1">{s?.status === "running" ? <Loader2 size={10} className="animate-spin text-sky-400" /> : s?.status === "done" ? <CheckCircle2 size={10} className="text-emerald-400" /> : s?.status === "failed" || s?.status === "retrying" ? <XCircle size={10} className="text-red-400" /> : <CircleDashed size={10} className="text-[var(--txt-dim)]" />}</span>
                          <div className="min-w-0">
                            <p className="font-medium">{s?.title || "Step"}</p>
                            {s?.detail && <p className="break-all font-mono text-[10.5px] text-[var(--txt-dim)]">{s.detail}</p>}
                            {s?.result && <details className="mt-0.5"><summary className="cursor-pointer text-[10.5px] text-sky-400">result</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-1.5 font-mono text-[10px]">{s.result}</pre></details>}
                          </div>
                        </div>
                      ))}
                      {!!commands.length && (
                        <div className="mt-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Commands run</p>
                          {commands.map((c, i) => <p key={i} className="truncate font-mono text-[10.5px] text-[var(--txt-dim)]">$ {c}</p>)}
                        </div>
                      )}
                      {(t.status === "failed" || t.status === "cancelled") && (
                        <button className="mt-2 flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
                          onClick={() => setGoal(t.title)}>
                          <RotateCcw size={10} /> Retry (re-run prompt)
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

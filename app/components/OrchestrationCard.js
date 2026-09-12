"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  Code2, ShieldCheck, Search, FlaskConical, Check, AlertCircle, Loader2,
  Crown, ChevronDown, ListChecks, Cpu, Brain, ClipboardList, Eye, EyeOff,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "@/lib/store";
import AgentPopup from "./AgentPopup";
import AgentAvatar from "./AgentAvatar";

const ROLE_META = {
  coder: { icon: Code2, label: "Coder", color: "#3b82f6", glow: "59,130,246" },
  reviewer: { icon: ShieldCheck, label: "Reviewer", color: "#22c55e", glow: "34,197,94" },
  researcher: { icon: Search, label: "Researcher", color: "#a855f7", glow: "168,85,247" },
  tester: { icon: FlaskConical, label: "Tester", color: "#f59e0b", glow: "245,158,11" },
};

const PHASE_META = [
  { key: "classify", label: "Analyze task", icon: Brain },
  { key: "analyze", label: "Deep analysis", icon: Search },
  { key: "plan", label: "CEO planning", icon: Crown },
  { key: "workers", label: "Agents working", icon: Cpu },
  { key: "review", label: "CEO review", icon: Eye },
];

const RUNNING_PHASES = ["classify", "analyze", "plan", "workers", "review"];

export default function OrchestrationCard({ orch, chatId, msgId, onEditCode, onInsertChat, onPlanDecision }) {
  // Hooks must run before any early return.
  const [pinnedId, setPinnedId] = useState(null);
  const [manualId, setManualId] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  // Reset the popup whenever a NEW orchestration run starts.
  const runKey = orch?.startedAt;
  const [seenRun, setSeenRun] = useState(runKey);
  useEffect(() => {
    if (runKey !== seenRun) {
      setSeenRun(runKey);
      setDismissed(false);
      setPinnedId(null);
      setManualId(null);
    }
  }, [runKey, seenRun]);

  if (!orch) return null;
  const phaseIdx = PHASE_META.findIndex((p) => p.key === orch.phase);
  const running = ["classify", "analyze", "plan", "workers", "review"].includes(orch.phase) || orch.phase === "awaiting-approval";
  const done = orch.phase === "done";

  // Live agent popup: the currently-working agent's screen shows automatically
  // (until the user closes it); any agent's screen can be opened from its eye
  // button; pinned screens survive worker switches.
  const working = orch.subtasks.find((s) => s.status === "working") || null;
  const pinnedSub = orch.subtasks.find((s) => s.id === pinnedId) || null;
  const manualSub = orch.subtasks.find((s) => s.id === manualId) || null;
  const popupSub =
    pinnedSub ||
    manualSub ||
    (!dismissed && working && running ? working : null);
  const showPopup = !!popupSub;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl overflow-hidden mb-3"
      style={{ border: "1px solid var(--cb-border)", background: "var(--cb-surface)" }}
    >
      {/* Header: title + status pill */}
      <div
        className="flex items-center gap-2 px-3.5 py-2.5"
        style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--cb-accent) 10%, transparent), transparent)" }}
      >
        <motion.span
          animate={running ? { rotate: [0, 8, -8, 0] } : {}}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in srgb, var(--cb-accent) 20%, transparent)" }}
        >
          <Crown size={13} style={{ color: "var(--cb-accent)" }} />
        </motion.span>
        <span className="text-sm font-semibold tracking-tight flex-1">Agent Team</span>
        {running && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
            style={{ background: "color-mix(in srgb, var(--cb-accent) 16%, transparent)", color: "var(--cb-accent)" }}>
            <Loader2 size={9} className="animate-spin" />
            {PHASE_META[Math.max(0, phaseIdx)]?.label}
          </span>
        )}
        {done && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
            style={{ background: "rgba(34,197,94,0.14)", color: "#22c55e" }}
          >
            <ShieldCheck size={10} /> Verified by CEO
          </motion.span>
        )}
        {orch.phase === "failed" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(239,68,68,0.14)", color: "#ef4444" }}>
            Failed
          </span>
        )}
        {orch.phase === "stopped" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--cb-border)", color: "var(--cb-muted)" }}>
            Stopped
          </span>
        )}
      </div>

      {/* Model recommendation from the classifier — what kind of model suits
          this task, and whether we switched to a better one. */}
      {orch.modelNote && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-3.5 overflow-hidden"
        >
          <div
            className="mb-2 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-[10.5px]"
            style={{ background: "color-mix(in srgb, var(--cb-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--cb-accent) 20%, transparent)", color: "var(--cb-muted)" }}
          >
            <Cpu size={11} style={{ color: "var(--cb-accent)" }} className="shrink-0" />
            <span className="flex-1">{orch.modelNote}</span>
          </div>
        </motion.div>
      )}

      {/* PLAN APPROVAL GATE — ZCode-style plan mode. Agents wait until the
          user reviews the analysis + team and presses Start. */}
      {orch.phase === "awaiting-approval" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3.5 mb-3 rounded-lg p-3"
          style={{ background: "color-mix(in srgb, #f59e0b 8%, transparent)", border: "1px solid rgba(245,158,11,0.35)" }}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5" style={{ color: "#f59e0b" }}>
            <ClipboardList size={13} /> Plan ready — আপনার অনুমতি লাগবে
          </div>
          <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: "var(--cb-muted)" }}>
            উপরের analysis আর agent team দেখে নিন। <strong style={{ color: "var(--cb-text)" }}>Start</strong> চাপলে agents আপনার অনুমতি নিয়ে কাজ শুরু করবে; Deny চাপলে এই run বন্ধ হবে।
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPlanDecision?.(true)}
              className="cb-focus px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{ background: "#22c55e", color: "white" }}
            >
              <Check size={12} /> Start agents
            </button>
            <button
              onClick={() => onPlanDecision?.(false)}
              className="cb-focus px-4 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-text)" }}
            >
              Deny
            </button>
          </div>
        </motion.div>
      )}

      {/* CEO's deep task analysis — shown once the analysis call finishes,
          before the team is built. */}
      {orch.analysis && (orch.phase === "analyze" || running) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0 }}
          className="px-3.5 pb-2 overflow-hidden"
        >
          <div
            className="rounded-lg p-2.5"
            style={{ background: "color-mix(in srgb, var(--cb-accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--cb-accent) 18%, transparent)" }}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--cb-accent)" }}>
              <Search size={10} /> CEO Task Analysis
              {orch.phase === "analyze" && <Loader2 size={9} className="animate-spin ml-1" />}
            </div>
            <div className="text-[11px] leading-relaxed space-y-1" style={{ color: "var(--cb-text)" }}>
              {orch.analysis.goal && (
                <div><span style={{ color: "var(--cb-muted)" }}>🎯 Goal: </span>{orch.analysis.goal}</div>
              )}
              {orch.analysis.size && (
                <div><span style={{ color: "var(--cb-muted)" }}>📐 Size: </span>{orch.analysis.size}{orch.analysis.sizeWhy ? ` — ${orch.analysis.sizeWhy}` : ""}</div>
              )}
              {orch.analysis.stack && (
                <div><span style={{ color: "var(--cb-muted)" }}>🛠 Stack: </span>{orch.analysis.stack}</div>
              )}
              {orch.analysis.skills?.length > 0 && (
                <div className="flex items-start gap-1">
                  <span style={{ color: "var(--cb-muted)" }}>💼 Skills:</span>
                  <span className="flex flex-wrap gap-1">
                    {orch.analysis.skills.map((sk, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "color-mix(in srgb, var(--cb-accent) 12%, transparent)", color: "var(--cb-accent)" }}>
                        {sk}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {orch.analysis.risks?.length > 0 && (
                <div><span style={{ color: "var(--cb-muted)" }}>⚠ Risks: </span>{orch.analysis.risks.join(" · ")}</div>
              )}
              {orch.analysis.teamWhy && (
                <div><span style={{ color: "var(--cb-muted)" }}>👥 Team: </span>{orch.analysis.teamWhy}</div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Phase timeline */}
      <div className="px-3.5 py-2.5 flex items-center gap-1 overflow-x-auto">
        {PHASE_META.map((p, i) => {
          const active = i === phaseIdx && running;
          const complete = phaseIdx > i || done;
          return (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="flex items-center gap-1 shrink-0"
            >
              {i > 0 && (
                <motion.span
                  className="block h-px w-4"
                  animate={{ background: complete ? "#22c55e" : "var(--cb-border)" }}
                />
              )}
              <motion.span
                animate={
                  active
                    ? { scale: [1, 1.08, 1], boxShadow: "0 0 0 3px color-mix(in srgb, var(--cb-accent) 18%, transparent)" }
                    : {}
                }
                transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: complete ? "rgba(34,197,94,0.15)" : active ? "color-mix(in srgb, var(--cb-accent) 16%, transparent)" : "var(--cb-bg)",
                  border: `1px solid ${complete ? "rgba(34,197,94,0.4)" : active ? "color-mix(in srgb, var(--cb-accent) 40%, transparent)" : "var(--cb-border)"}`,
                }}
                title={p.label}
              >
                {complete ? (
                  <Check size={11} style={{ color: "#22c55e" }} />
                ) : active ? (
                  <Loader2 size={11} className="animate-spin" style={{ color: "var(--cb-accent)" }} />
                ) : (
                  <p.icon size={11} style={{ color: "var(--cb-muted)" }} />
                )}
              </motion.span>
              <span
                className="text-[10px] font-medium hidden sm:inline"
                style={{ color: active ? "var(--cb-accent)" : complete ? "var(--cb-text)" : "var(--cb-muted)" }}
              >
                {p.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Why this team — CEO's rationale for the team size and roles */}
      {orch.teamRationale && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-3.5 pb-1 pt-0.5 flex items-start gap-1.5"
        >
          <ClipboardList size={11} className="shrink-0 mt-0.5" style={{ color: "var(--cb-accent)" }} />
          <span className="text-[10.5px] leading-relaxed" style={{ color: "var(--cb-muted)" }}>
            {orch.teamRationale}
          </span>
        </motion.div>
      )}

      {/* Agent cards */}
      <AnimatePresence>
        {orch.subtasks?.length > 0 && (
          <motion.div
            key="subs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-3 pb-3 space-y-1.5"
          >
            {orch.subtasks.map((s, i) => (
              <SubtaskCard key={s.id} sub={s} index={i} onShowPopup={(id) => setManualId(manualId === id ? null : id)} popupActive={popupSub?.id === s.id} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The floating live agent screen */}
      <AnimatePresence>
        {showPopup && popupSub && (
          <AgentPopup
            key={popupSub.id + "-" + (popupSub.status === "working" ? "live" : "done")}
            sub={popupSub}
            onClose={() => { setManualId(null); setPinnedId(null); setDismissed(true); }}
            pinned={pinnedId === popupSub.id}
            setPinned={(v) => setPinnedId(v ? popupSub.id : null)}
            onEditCode={chatId && msgId ? (subId, newCode) => {
              // Patch this subtask's story in the persisted message.
              const s = useStore.getState().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === msgId);
              const st = s?.orchestration?.subtasks.find((x) => x.id === subId);
              useStore.getState().updateOrchSubtask(chatId, msgId, subId, {
                story: { ...(st?.story || {}), code: newCode },
              });
            } : undefined}
            onInsertChat={onInsertChat || ((code) => useStore.getState().setChatInputDraft(code))}
          />
        )}
      </AnimatePresence>

      {/* Next steps */}
      {done && orch.nextSteps?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="px-3.5 pb-3 pt-1"
        >
          <div className="rounded-lg p-3" style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: "var(--cb-accent)" }}>
              <ListChecks size={13} /> Next steps
            </div>
            <ol className="space-y-1.5">
              {orch.nextSteps.map((step, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}
                  className="flex items-start gap-2 text-xs"
                  style={{ color: "var(--cb-text)" }}
                >
                  <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "color-mix(in srgb, var(--cb-accent) 14%, transparent)", color: "var(--cb-accent)", fontSize: 9, fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </motion.li>
              ))}
            </ol>
          </div>
        </motion.div>
      )}

      {orch.error && (
        <div className="px-3.5 pb-3 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle size={12} /> {orch.error}
        </div>
      )}
    </motion.div>
  );
}

function SubtaskCard({ sub, index, onShowPopup, popupActive }) {
  const [open, setOpen] = useState(false);
  const meta = ROLE_META[sub.agentRole] || ROLE_META.coder;
  const Icon = meta.icon;
  const working = sub.status === "working";
  const doneOk = sub.status === "done";
  const failed = sub.status === "failed";
  const queued = sub.status === "pending";
  const hasStoryFix = sub.story && sub.story.issue && sub.story.fixedCode;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: queued ? 0.55 : 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${failed ? "rgba(239,68,68,0.4)" : popupActive ? `rgba(${meta.glow},0.45)` : "var(--cb-border)"}`,
        background: "var(--cb-bg)",
        boxShadow: popupActive ? `0 0 12px -2px rgba(${meta.glow},0.35)` : undefined,
      }}
    >
      <div className="w-full flex items-center gap-2 px-2.5 py-2">
        <span className="shrink-0">
          <AgentAvatar role={sub.agentRole} name={sub.agentName} size={26} working={sub.status === "working"} />
        </span>
        <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left cb-focus">
          <span className="block text-xs font-medium truncate">
            {sub.agentName ? <span style={{ color: meta.color }}>{sub.agentName}</span> : sub.title}
            {sub.agentName && <span style={{ color: "var(--cb-muted)" }}> — {sub.title}</span>}
          </span>
          <span className="block text-[10px]" style={{ color: "var(--cb-muted)" }}>
            {meta.label} · {sub.id}{queued ? " · queued" : ""}{hasStoryFix ? " · self-fixed ⚒" : ""}
          </span>
        </button>
        {/* Open this agent's live screen in the popup */}
        <button
          onClick={() => onShowPopup?.(sub.id)}
          className="cb-focus p-1 rounded shrink-0"
          title="Show agent screen"
          aria-label="Show agent screen"
          style={{ color: popupActive ? meta.color : "var(--cb-muted)" }}
        >
          {popupActive ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        {queued && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--cb-border)" }} />}
        {working && <Loader2 size={12} className="animate-spin shrink-0" style={{ color: meta.color }} />}
        {doneOk && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
            <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.15)" }}>
              <Check size={10} style={{ color: "#22c55e" }} />
            </span>
          </motion.span>
        )}
        {failed && <AlertCircle size={13} className="shrink-0" style={{ color: "#ef4444" }} />}
        {sub.status === "stopped" && <span className="text-[10px] shrink-0" style={{ color: "var(--cb-muted)" }}>stopped</span>}
        {sub.output && (
          <button onClick={() => setOpen(!open)} className="cb-focus p-0.5 shrink-0" aria-label="Toggle details">
            <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--cb-muted)" }} />
          </button>
        )}
      </div>

      {/* Shimmer progress line while working */}
      {working && (
        <div className="h-0.5 overflow-hidden" style={{ background: "var(--cb-border)" }}>
          <motion.div
            className="h-full w-1/3 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      )}

      {/* Collapsible output */}
      <AnimatePresence initial={false}>
        {open && sub.output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-1 text-xs border-t" style={{ borderColor: "var(--cb-border)", color: "var(--cb-text)" }}>
              <div className="prose-cb max-w-none text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sub.output}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

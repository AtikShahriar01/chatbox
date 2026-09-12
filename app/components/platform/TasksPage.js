"use client";

// Tasks page (spec-5 §TASKS PAGE) — tabs Active/Completed/Failed/Cancelled,
// status + duration + result per task, live updates.

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ListChecks, Loader2, CheckCircle2, XCircle, CircleDashed, ChevronDown, ChevronRight, Code2 } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { EmptyState } from "../platform/States";

const TABS = ["Active", "Completed", "Failed", "Cancelled"];
const ACTIVE_SET = ["queued", "planning", "running", "waiting", "testing", "fixing", "paused"];

const STATUS_UI = {
  running: { icon: Loader2, cls: "text-sky-400", spin: true },
  planning: { icon: Loader2, cls: "text-sky-400", spin: true },
  testing: { icon: Loader2, cls: "text-sky-400", spin: true },
  fixing: { icon: Loader2, cls: "text-amber-400", spin: true },
  queued: { icon: CircleDashed, cls: "" },
  waiting: { icon: CircleDashed, cls: "text-amber-400" },
  paused: { icon: CircleDashed, cls: "text-amber-400" },
  completed: { icon: CheckCircle2, cls: "text-emerald-400" },
  failed: { icon: XCircle, cls: "text-red-400" },
  cancelled: { icon: XCircle, cls: "" },
};

export default function TasksPage() {
  const tasks = useIde((s) => s.tasks);
  const [tab, setTab] = useState("Active");
  const [open, setOpen] = useState(null);

  const filtered = tasks.filter((t) =>
    tab === "Active" ? ACTIVE_SET.includes(t.status)
      : tab === "Completed" ? t.status === "completed"
      : tab === "Failed" ? t.status === "failed"
      : t.status === "cancelled"
  );

  const dur = (t) => {
    if (!t.startedAt) return "—";
    const end = t.finishedAt ? new Date(t.finishedAt).getTime() : Date.now();
    const s = Math.max(0, Math.round((end - new Date(t.startedAt).getTime()) / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-[17px] font-bold tracking-tight">Tasks</h1>
        <Link href="/console/agent" className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
          Start a task
        </Link>
      </div>

      <div className="mb-3 flex gap-1" role="tablist" aria-label="Task filters">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ide-transition ${tab === t ? "" : "hover:bg-white/[0.06]"}`}
            style={tab === t
              ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }
              : { color: "var(--txt-dim)" }}>
            {t} {t === "Active" && `(${tasks.filter((x) => ACTIVE_SET.includes(x.status)).length})`}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="rounded-2xl border py-14" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <EmptyState icon={ListChecks}
            title={tab === "Active" ? "No active tasks" : `No ${tab.toLowerCase()} tasks`}
            body="Give the agent a job like “inspect this project and fix build errors” — every step appears here in real time."
            action={<Link href="/console/agent" className="mt-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "var(--accent)", color: "white" }}>Go to Agent</Link>} />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const ui = STATUS_UI[t.status] || STATUS_UI.queued;
            const Icon = ui.icon;
            const isOpen = open === t.id;
            return (
              <div key={t.id} className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]" onClick={() => setOpen(isOpen ? null : t.id)}>
                  <Icon size={15} className={`${ui.cls} shrink-0 ${ui.spin ? "animate-spin" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{t.title}</p>
                    <p className="text-[10.5px]" style={{ color: "var(--txt-dim)" }}>
                      {t.status} · {dur(t)} · {(t.steps?.length || 0)} steps{t.files?.length ? ` · ${t.files.length} files` : ""}
                    </p>
                  </div>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
                        {t.error && <p className="mb-2 rounded-lg p-2 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--err) 10%, transparent)", color: "var(--err)" }}>{t.error}</p>}
                        {t.summary && <p className="mb-2 rounded-lg p-2 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--ok) 10%, transparent)", color: "var(--ok)" }}>{t.summary}</p>}
                        {(t.steps || []).map((s, i) => (
                          <div key={i} className="flex items-start gap-2 py-0.5 text-[11.5px]">
                            <span className="mt-0.5">{s?.status === "done" ? <CheckCircle2 size={11} className="text-emerald-400" /> : s?.status === "failed" ? <XCircle size={11} className="text-red-400" /> : s?.status === "running" ? <Loader2 size={11} className="animate-spin text-sky-400" /> : <CircleDashed size={11} style={{ color: "var(--txt-faint)" }} />}</span>
                            <span className="font-medium">{s?.title || "Step"}</span>
                            {s?.detail && <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]" style={{ color: "var(--txt-dim)" }} title={s.detail}>{s.detail}</span>}
                          </div>
                        ))}
                        {!!(t.commands || []).length && (
                          <div className="mt-2">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--txt-faint)" }}>Commands</p>
                            {t.commands.slice(-6).map((c, i) => <p key={i} className="truncate font-mono text-[10.5px]" style={{ color: "var(--txt-dim)" }}>$ {c}</p>)}
                          </div>
                        )}
                        <Link href="/ide" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: "var(--accent)" }}>
                          <Code2 size={11} /> Open in Workspace
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

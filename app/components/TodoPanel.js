"use client";

// Persistent live TODO panel (ZCode-style) — a fixed right-hand column that is
// visible in the CHAT view while the agent works. Animated progress bar, an
// ordered checklist that ticks in real time, and a clear header.

import { motion, AnimatePresence } from "motion/react";
import { ListChecks, X, Loader2, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import { useIde } from "@/lib/ide-store";
import { useUi } from "@/lib/ui-store";

export default function TodoPanel() {
  const todos = useIde((s) => s.liveTodos);
  const title = useIde((s) => s.todoTitle);
  const running = useIde((s) => s.todoRunning);
  const clear = useIde((s) => s.clearLiveTodos);
  const view = useUi((s) => s.view);

  const total = todos.length;
  const done = todos.filter((t) => t.status === "done").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <AnimatePresence>
      {total > 0 && view !== "ide" && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          className="fixed right-3 top-12 z-[60] hidden w-[300px] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl lg:block"
          style={{ borderColor: "var(--cb-border)", background: "color-mix(in srgb, var(--cb-surface) 92%, transparent)" }}
          aria-label="Task checklist"
        >
          <div className="flex max-h-[75vh] flex-col">
            {/* header */}
            <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--cb-border)" }}>
              {running ? (
                <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: "var(--cb-accent)" }} />
              ) : (
                <ListChecks size={14} className="shrink-0" style={{ color: "var(--cb-accent)" }} />
              )}
              <span className="text-[12.5px] font-semibold">
                {running ? "কাজ চলছে" : done === total ? "কাজ সম্পন্ন" : "কাজ লিস্ট"}
              </span>
              <span className="ml-auto text-[11px] font-mono" style={{ color: "var(--cb-muted)" }}>
                {done}/{total}
              </span>
              <button
                onClick={clear}
                className="cb-focus rounded p-1 hover:bg-cb-border"
                aria-label="Close task list"
                title="লিস্ট বন্ধ করুন"
              >
                <X size={12} />
              </button>
            </div>

            {/* task title */}
            {title && (
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--cb-border)" }}>
                <p className="truncate text-[11.5px]" style={{ color: "var(--cb-muted)" }} title={title}>
                  📌 {title}
                </p>
              </div>
            )}

            {/* progress bar */}
            <div className="px-3 pt-2.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--cb-border)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--cb-accent)" }}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* ordered checklist */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <ol className="space-y-2">
                {todos.map((t, i) => (
                  <motion.li
                    key={`${i}-${t.text}`}
                    layout
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                    className="flex items-start gap-2 text-[12.5px] leading-snug"
                  >
                    <span className="mt-[1px] shrink-0">
                      {t.status === "done" ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : t.status === "doing" ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: "var(--cb-accent)" }} />
                      ) : t.status === "failed" ? (
                        <XCircle size={14} className="text-red-400" />
                      ) : (
                        <CircleDashed size={14} style={{ color: "var(--cb-muted)" }} />
                      )}
                    </span>
                    <span
                      className={t.status === "done" ? "line-through" : ""}
                      style={{
                        color: t.status === "done" ? "var(--cb-muted)" : t.status === "doing" ? "var(--cb-text)" : "var(--cb-muted)",
                        opacity: t.status === "done" ? 0.65 : 1,
                      }}
                    >
                      <span className="mr-1 font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>{i + 1}.</span>
                      {t.text}
                    </span>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* footer */}
            <div className="border-t px-3 py-2 text-[10.5px]" style={{ borderColor: "var(--cb-border)", color: "var(--cb-muted)" }}>
              {running ? "AI কাজ করছে — লিস্ট লাইভ আপডেট হচ্ছে…" : `সম্পন্ন: ${done}/${total}`}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

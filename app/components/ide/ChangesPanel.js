"use client";

// Changes review (spec-5 §DIFF / CHANGE REVIEW + master §14) — every AI file
// modification lands here: accept (keep), reject (restore original), open
// in editor with diff. Nothing is buried in chat.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GitCompare, Check, X, FileCode, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";

export default function ChangesPanel({ onOpenFile }) {
  const changes = useIde((s) => s.aiChanges);
  const resolveAiChange = useIde((s) => s.resolveAiChange);
  const markSaved = useIde((s) => s.markSaved);
  const updateTab = useIde((s) => s.updateTab);
  const tabs = useIde((s) => s.tabs);
  const [open, setOpen] = useState({});

  const reject = async (c) => {
    // restore the pre-change content we snapshotted before the edit
    if (c.before != null) {
      await pc("/file/write", { path: c.path, content: c.before });
      markSaved(c.path, c.before);
    }
    resolveAiChange(c.id, "rejected");
  };
  const accept = (c) => resolveAiChange(c.id, "accepted");
  const view = (c) => {
    const tab = tabs.find((t) => t.path === c.path);
    if (!tab) onOpenFile(c.path, c.path.split(/[\\/]/).pop(), c.after ?? "");
    else updateTab(c.path, { content: c.after ?? tab.content, dirty: true });
    onOpenFile(c.path, c.path.split(/[\\/]/).pop(), undefined, { keepBuffer: true });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
        <GitCompare size={13} className="text-[var(--accent)]" />
        <span className="text-[12px] font-semibold">AI Changes</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
          {changes.filter((c) => c.status === "applied").length} pending
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!changes.length && (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-[var(--txt-dim)]">
            এজেন্ট কোনো ফাইল বদলালে সব পরিবর্তন এখানে জমা হবে — accept/reject করতে পারবেন।
          </p>
        )}
        {changes.map((c) => {
          const isOpen = open[c.id];
          const fileName = c.path.split(/[\\/]/).pop();
          return (
            <div key={c.id} className="mb-1.5 overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04]" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>
                <FileCode size={13} className="shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{fileName}</span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                  style={{ background: c.status === "accepted" ? "color-mix(in srgb, var(--ok) 15%, transparent)" : c.status === "rejected" ? "color-mix(in srgb, var(--err) 15%, transparent)" : "color-mix(in srgb, var(--warn) 15%, transparent)", color: c.status === "accepted" ? "var(--ok)" : c.status === "rejected" ? "var(--err)" : "var(--warn)" }}>
                  {c.status}
                </span>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="border-t border-white/5 px-3 py-2">
                      <p className="mb-1 text-[11px] font-mono text-[var(--txt-dim)]" title={c.path}>{c.path}</p>
                      {c.reason && <p className="mb-1.5 text-[11px]"><Sparkles size={10} className="mr-1 inline text-[var(--accent)]" />{c.reason}</p>}
                      {c.before != null && (
                        <details className="mb-2">
                          <summary className="cursor-pointer text-[10.5px] text-sky-400">before (first 60 lines)</summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-1.5 font-mono text-[10px]">{c.before.split("\n").slice(0, 60).join("\n")}</pre>
                        </details>
                      )}
                      <div className="flex gap-1.5">
                        {c.status === "applied" && (
                          <>
                            <button className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/25" onClick={() => accept(c)}>
                              <Check size={11} /> Accept
                            </button>
                            <button className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/25" onClick={() => reject(c)}>
                              <X size={11} /> Reject & revert
                            </button>
                          </>
                        )}
                        <button className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium hover:bg-white/20" onClick={() => view(c)}>Open in editor</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

// AgentStatus (spec-5 §AGENT STATUS) — one canonical status pill used
// everywhere: ONLINE / CONNECTING / RECONNECTING / OFFLINE / PAUSED / BUSY /
// WAITING FOR APPROVAL / ERROR. Dot + text (never color alone), optional
// detail popover with device info and controls.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, CircleStop, RefreshCw, X } from "lucide-react";
import { pc } from "@/lib/pc";

export function deriveAgentState({ connected, pending, runningTask, paused, pollFails, error }) {
  if (error) return { key: "ERROR", color: "var(--err)", label: "ERROR" };
  if (!connected) return pollFails > 1 ? { key: "RECONNECTING", color: "var(--warn)", label: "RECONNECTING" } : { key: "OFFLINE", color: "var(--err)", label: "OFFLINE" };
  if (pending > 0) return { key: "WAITING", color: "var(--warn)", label: "WAITING FOR APPROVAL" };
  if (paused) return { key: "PAUSED", color: "var(--warn)", label: "PAUSED" };
  if (runningTask) return { key: "BUSY", color: "var(--info)", label: "BUSY" };
  return { key: "ONLINE", color: "var(--ok)", label: "ONLINE" };
}

export default function AgentStatus({ state, detail, onReconnect, compact }) {
  const [open, setOpen] = useState(false);
  const s = state || { key: "OFFLINE", color: "var(--err)", label: "OFFLINE" };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium ide-transition"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 70%, transparent)" }}
        aria-label={`Agent status: ${s.label}`}
      >
        <span className="relative flex h-2 w-2">
          {(s.key === "RECONNECTING" || s.key === "CONNECTING") && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />
          )}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
        </span>
        {!compact && <span style={{ color: "var(--txt)" }}>{s.label}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute right-0 z-[61] mt-2 w-72 rounded-xl p-3 shadow-xl"
              style={{ background: "var(--panel-bg)", border: "1px solid var(--border)", backdropFilter: "blur(14px)" }}
              role="dialog" aria-label="Agent details"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Cpu size={13} className="text-[var(--accent)]" /> Local Agent</p>
                <button onClick={() => setOpen(false)} className="rounded p-0.5 hover:bg-white/10"><X size={12} /></button>
              </div>
              <dl className="space-y-1 text-[11.5px]">
                <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Status</dt><dd className="font-medium" style={{ color: s.color }}>{s.label}</dd></div>
                {detail?.workspace && <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Workspace</dt><dd className="max-w-44 truncate font-mono text-[10.5px]" title={detail.workspace}>{detail.workspace}</dd></div>}
                {detail?.mode && <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Mode</dt><dd className="font-medium uppercase">{detail.mode}</dd></div>}
                {detail?.platform && <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Device</dt><dd>{detail.platform} · {detail.arch}</dd></div>}
                {detail?.heartbeat && <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Last heartbeat</dt><dd>{detail.heartbeat}</dd></div>}
                {detail?.running != null && <div className="flex justify-between gap-2"><dt style={{ color: "var(--txt-dim)" }}>Processes</dt><dd>{detail.running} running</dd></div>}
              </dl>
              {onReconnect && (
                <button onClick={() => { setOpen(false); onReconnect(); }}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11.5px] font-medium"
                  style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>
                  <RefreshCw size={12} /> Reconnect
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

// Agent Management page (spec-5 §AGENT STATUS / §APPROVAL EXPERIENCE /
// §PERMISSION CENTER) — device detail, mode switch, approvals, activity.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Cpu, Lock, ShieldCheck, Unlock, ShieldAlert, Check, X, Activity, Wrench,
} from "lucide-react";
import { bridgeStatus, pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import { useStore } from "@/lib/store";
import { SkeletonList, ErrorState } from "../platform/States";
import { deriveAgentState } from "../platform/AgentStatus";

const MODES = [
  { key: "ask", label: "Ask every time", icon: Lock, desc: "প্রতিটা লেখা/কমান্ডের আগে অনুমতি চাইবে — সবচেয়ে নিরাপদ" },
  { key: "safe", label: "Safe (auto reads)", icon: ShieldCheck, desc: "পড়া/লিস্ট/সার্চ অটো; লেখা, ডিলিট, কমান্ডে অনুমতি চাইবে" },
  { key: "auto", label: "Full Access", icon: Unlock, desc: "workspace-এর ভেতরে সব অটো — নিজের দায়িত্বে" },
];

const PERMISSIONS = [
  { key: "read", label: "Workspace Read", risk: "low", desc: "ফাইল পড়া, লিস্ট, সার্চ — শুধু workspace-এর ভেতরে" },
  { key: "write", label: "Workspace Write", risk: "medium", desc: "ফাইল তৈরি/এডিট (protected ফাইল বাদে)" },
  { key: "delete", label: "File Delete", risk: "high", desc: "ফাইল/ফোল্ডার মুছে ফেলা" },
  { key: "terminal", label: "Terminal", risk: "high", desc: "শেল কমান্ড চালানো (credential-store denylist সহ)" },
  { key: "git", label: "Git Write", risk: "medium", desc: "stage/commit/branch/checkpoint" },
  { key: "process", label: "Processes", risk: "medium", desc: "dev server চালানো/বন্ধ করা" },
];

export default function AgentPage() {
  const [agent, setAgent] = useState(null);
  const [sys, setSys] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useIde((s) => s.pendingApprovals);
  const setPending = useIde((s) => s.setPending);
  const activity = useIde((s) => s.activity);
  const tasks = useIde((s) => s.tasks);
  const store = useStore();
  const running = tasks.some((t) => ["running", "planning", "testing", "fixing"].includes(t.status));

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const [s, y] = await Promise.all([bridgeStatus(), pc("/sysinfo")]);
      setAgent(s);
      if (y?.ok) setSys(y);
      const p = await pc("/pending");
      setPending(p?.pending || []);
    } catch (e) {
      setErr(String(e?.message || e));
    }
    setBusy(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = async (mode) => { await pc("/mode", { mode }); load(); };
  const decide = async (id, allow) => { await pc("/approve", { id, allow }); setPending((l) => l.filter((p) => p.id !== id)); };

  if (err && !agent) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <ErrorState title="Local Agent connection failed" body="agent-bridge চলছে না বা অ্যাক্সেস করা যাচ্ছে না। ব্রিজ চালু করে আবার চেষ্টা করুন।" details={err} onRetry={load} />
        </div>
      </div>
    );
  }

  const state = deriveAgentState({
    connected: !!agent?.ok, pending: pending.length, runningTask: running, pollFails: 0,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-[17px] font-bold tracking-tight">Agent</h1>
        <button onClick={load} className="ml-auto rounded-lg border px-3 py-1.5 text-[11.5px] font-medium" style={{ borderColor: "var(--border)" }}>
          {busy ? "…" : "Refresh"}
        </button>
      </div>

      {/* device card */}
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
            <Cpu size={20} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{sys?.hostname || "My PC"}</p>
            <p className="text-[11px]" style={{ color: "var(--txt-dim)" }}>
              {sys ? `${sys.platform} · ${sys.arch} · ${sys.cpus} cores · ${sys.freeMemGB}/${sys.totalMemGB} GB free` : "device info unavailable"}
            </p>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: `color-mix(in srgb, ${state.color} 15%, transparent)`, color: state.color }}>
            {state.label}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-3">
          <div><dt style={{ color: "var(--txt-faint)" }}>Workspace</dt><dd className="truncate font-mono text-[10.5px]" title={agent?.workspace}>{agent?.workspace || "—"}</dd></div>
          <div><dt style={{ color: "var(--txt-faint)" }}>Mode</dt><dd className="font-medium uppercase">{agent?.mode || "—"}</dd></div>
          <div><dt style={{ color: "var(--txt-faint)" }}>Running procs</dt><dd>{sys?.runningProcs ?? "—"} · terminals: {sys?.terminals ?? "—"}</dd></div>
          <div><dt style={{ color: "var(--txt-faint)" }}>Node</dt><dd>{sys?.node || "—"}</dd></div>
          <div><dt style={{ color: "var(--txt-faint)" }}>Uptime</dt><dd>{sys ? `${sys.uptimeH}h` : "—"}</dd></div>
          <div><dt style={{ color: "var(--txt-faint)" }}>Model</dt><dd className="truncate" title={store.apiModel}>{store.apiModel || "—"}</dd></div>
        </dl>
      </section>

      {/* approvals */}
      {pending.length > 0 && (
        <section className="rounded-2xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)", background: "color-mix(in srgb, var(--warn) 7%, transparent)" }}>
          <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--warn)" }}>
            <ShieldAlert size={14} /> Approval required ({pending.length})
          </h2>
          {pending.map((p) => (
            <div key={p.id} className="mb-2 rounded-xl p-2.5" style={{ background: "color-mix(in srgb, var(--surface) 75%, transparent)" }}>
              <p className="text-[11px] font-semibold">{p.kind}</p>
              <p className="mt-0.5 break-all font-mono text-[11px]" style={{ color: "var(--txt-dim)" }}>{p.summary}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decide(p.id, true)} className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--ok) 18%, transparent)", color: "var(--ok)" }}>
                  <Check size={12} /> Allow
                </button>
                <button onClick={() => decide(p.id, false)} className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11.5px] font-semibold" style={{ background: "color-mix(in srgb, var(--err) 14%, transparent)", color: "var(--err)" }}>
                  <X size={12} /> Deny
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* permission modes */}
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <h2 className="mb-2.5 text-[13px] font-bold">Permission mode</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => {
            const active = agent?.mode === m.key;
            return (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`rounded-xl border p-3 text-left ide-transition ${active ? "" : "hover:-translate-y-0.5"}`}
                style={active
                  ? { borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }
                  : { borderColor: "var(--border)", background: "var(--surface)" }}>
                <m.icon size={15} style={{ color: active ? "var(--accent)" : "var(--txt-dim)" }} />
                <p className="mt-1.5 text-[12px] font-semibold">{m.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed" style={{ color: "var(--txt-dim)" }}>{m.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {PERMISSIONS.map((p) => (
            <div key={p.key} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.risk === "high" ? "var(--err)" : p.risk === "medium" ? "var(--warn)" : "var(--ok)" }} />
              <span className="text-[11.5px] font-medium">{p.label}</span>
              <span className="ml-auto truncate text-[10px]" style={{ color: "var(--txt-faint)" }} title={p.desc}>{p.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* live activity */}
      <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          <Activity size={13} className="text-[var(--accent)]" />
          <h2 className="text-[12.5px] font-semibold">Live activity</h2>
        </header>
        <div className="max-h-72 overflow-auto px-4 py-2">
          {activity.slice(0, 25).map((a) => (
            <div key={a.id} className="flex items-baseline gap-2 py-1 text-[11.5px]">
              <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--txt-faint)" }}>{new Date(a.at).toLocaleTimeString()}</span>
              <span className="shrink-0 font-semibold" style={{ color: a.actor === "agent" ? "var(--accent)" : "var(--info)" }}>{a.actor}</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--txt-dim)" }}>{a.action} {a.resource}</span>
              <span className="shrink-0 text-[10px]" style={{ color: /error|failed|denied/i.test(a.result || "") ? "var(--err)" : "var(--ok)" }}>{a.result}</span>
            </div>
          ))}
          {!activity.length && <p className="py-4 text-center text-[12px]" style={{ color: "var(--txt-dim)" }}>No activity yet.</p>}
        </div>
      </section>
    </div>
  );
}

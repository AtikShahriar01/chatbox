"use client";

// Bottom panel tabs: Git · Processes · Problems · Output · Audit (master §18,
// §22, UI spec §12). All data comes from the bridge — nothing is faked.

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  GitBranch, Cpu, AlertTriangle, ScrollText, ShieldCheck, RefreshCw,
  Square, RotateCcw, Save, CheckCircle2, XCircle, TerminalSquare,
} from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import TerminalPane from "./TerminalPane";

const TABS = [
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "processes", label: "Processes", icon: Cpu },
  { key: "problems", label: "Problems", icon: AlertTriangle },
  { key: "output", label: "Output", icon: ScrollText },
  { key: "audit", label: "Activity Log", icon: ShieldCheck },
];

export default function BottomPanel({ workspace, onOpenFile }) {
  const panels = useIde((s) => s.panels);
  const setBottomTab = useIde((s) => s.setBottomTab);
  const tab = panels.bottomTab;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setBottomTab(t.key)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11.5px] ${
              tab === t.key ? "bg-white/10 text-[var(--txt)]" : "text-[var(--txt-dim)] hover:bg-white/5"
            }`}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "terminal" && <TerminalPane workspace={workspace} />}
        {tab === "git" && <GitPanel workspace={workspace} onOpenFile={onOpenFile} />}
        {tab === "processes" && <ProcessPanel />}
        {tab === "problems" && <ProblemsPanel />}
        {tab === "output" && <OutputPanel />}
        {tab === "audit" && <AuditPanel />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Git ---- */
function GitPanel({ workspace, onOpenFile }) {
  const [status, setStatus] = useState(null);
  const [diff, setDiff] = useState("");
  const [log, setLog] = useState("");
  const [branches, setBranches] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshTree = useIde((s) => s.refreshTree);
  const pushActivity = useIde((s) => s.pushActivity);

  const refresh = useCallback(async () => {
    setBusy(true);
    const [s, d, l, b] = await Promise.all([
      pc("/git/status", { cwd: workspace }), pc("/git/diff", { cwd: workspace }),
      pc("/git/log", { cwd: workspace, limit: 15 }), pc("/git/branch", { cwd: workspace }),
    ]);
    setStatus(s?.ok || s?.stdout !== undefined ? s : null);
    setDiff(d?.stdout || "");
    setLog(l?.stdout || "");
    setBranches(b?.stdout || "");
    setBusy(false);
  }, [workspace]);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 10000); return () => clearInterval(iv); }, [refresh]);

  const stageAll = async () => { await pc("/git/stage", { cwd: workspace }); refresh(); refreshTree(); };
  const commit = async () => {
    const msg = window.prompt("Commit message:");
    if (!msg) return;
    // Dedicated /git/commit op → the bridge runs it as an args array
    // (gitExec), so the message can never inject shell commands.
    const r = await pc("/git/commit", { message: msg.slice(0, 500), cwd: workspace });
    pushActivity({ actor: "user", action: "git commit", resource: msg.slice(0, 60), result: r?.ok ? "ok" : String(r?.stderr || r?.error).slice(0, 100), risk: "medium" });
    refresh();
  };
  const checkpoint = async () => {
    const r = await pc("/checkpoint/create", { label: "manual", cwd: workspace });
    pushActivity({ actor: "user", action: "checkpoint", resource: workspace, result: r?.note || (r?.ok ? "ok" : "error"), risk: "medium" });
    refresh();
  };

  const files = (status?.stdout || "").split("\n").filter((l) => l.trim() && !l.startsWith("##"));
  const branchLine = (status?.stdout || "").split("\n").find((l) => l.startsWith("##")) || "(no git repo)";

  return (
    <div className="space-y-3 p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <GitBranch size={13} className="text-[var(--accent)]" />
        <span className="font-medium">{branchLine.replace("## ", "")}</span>
        <div className="ml-auto flex gap-1.5">
          <button className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 hover:bg-white/20" onClick={refresh}><RefreshCw size={11} className={busy ? "animate-spin" : ""} /> Refresh</button>
          <button className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 hover:bg-white/20" onClick={stageAll}><Save size={11} /> Stage all</button>
          <button className="rounded bg-[var(--accent)]/25 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/35" onClick={commit}>Commit</button>
          <button className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-amber-400 hover:bg-amber-500/30" title="Snapshot workspace for rollback" onClick={checkpoint}><RotateCcw size={11} /> Checkpoint</button>
        </div>
      </div>
      {files.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Changed files</p>
          {files.map((l) => {
            const [code, ...rest] = l.split(" ");
            const p = rest.join(" ").replace(/"/g, "");
            return (
              <button key={l} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/5"
                onClick={() => onOpenFile(workspace + "\\" + p.replace(/\//g, "\\"), p.split("/").pop())}>
                <span className={`rounded px-1 font-mono text-[10px] ${code.includes("D") ? "bg-red-500/20 text-red-400" : code.includes("A") ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>{code.trim()}</span>
                <span className="truncate font-mono">{p}</span>
              </button>
            );
          })}
        </div>
      )}
      {diff && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Diff</p>
          <pre className="max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed">
            {diff.split("\n").map((l, i) => (
              <div key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "text-emerald-400" : l.startsWith("-") && !l.startsWith("---") ? "text-red-400" : "text-[var(--txt-dim)]"}>{l}</div>
            ))}
          </pre>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Branches</p>
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 font-mono text-[11px]">{branches || "—"}</pre>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">History</p>
          <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 font-mono text-[11px]">{log || "—"}</pre>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Processes ---- */
function ProcessPanel() {
  const [procs, setProcs] = useState([]);
  const load = useCallback(async () => { const r = await pc("/proc/list"); setProcs(r?.procs || []); }, []);
  useEffect(() => { load(); const iv = setInterval(load, 2500); return () => clearInterval(iv); }, [load]);
  const stop = async (id) => { await pc("/proc/stop", { id }); load(); };
  return (
    <div className="p-3 text-[12px]">
      {!procs.length && <p className="text-[var(--txt-dim)]">No agent-started processes. Start a dev server from the AI panel or terminal.</p>}
      {procs.map((p) => (
        <motion.div key={p.id} layout className="mb-1.5 flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${p.status === "running" ? "bg-emerald-400" : "bg-red-400"}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11.5px]">{p.cmd}</p>
            <p className="text-[10.5px] text-[var(--txt-dim)]">
              pid {p.pid} · {p.status}{p.exitCode != null ? ` (${p.exitCode})` : ""}{p.port ? ` · port ${p.port}` : ""} · {new Date(p.startedAt).toLocaleTimeString()}
            </p>
          </div>
          {p.status === "running" && (
            <button className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-red-400 hover:bg-red-500/25" onClick={() => stop(p.id)}>
              <Square size={10} /> Stop
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Problems ---- */
function ProblemsPanel() {
  const problems = useIde((s) => s.activity).filter((a) => /error|failed|denied|blocked/i.test(a.result || ""));
  return (
    <div className="p-3 text-[12px]">
      {!problems.length ? (
        <p className="flex items-center gap-2 text-[var(--txt-dim)]"><CheckCircle2 size={14} className="text-emerald-400" /> No problems detected</p>
      ) : problems.map((p) => (
        <div key={p.id} className="mb-1 flex items-start gap-2 rounded px-2 py-1.5 hover:bg-white/5">
          <XCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <p className="truncate">{p.action} — {p.resource}</p>
            <p className="text-[11px] text-[var(--txt-dim)]">{p.result} · {new Date(p.at).toLocaleTimeString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Output ---- */
function OutputPanel() {
  const activity = useIde((s) => s.activity);
  return (
    <div className="p-3 font-mono text-[11px] leading-relaxed">
      {activity.slice(0, 80).map((a) => (
        <div key={a.id} className="flex gap-2">
          <span className="shrink-0 text-[var(--txt-dim)]">{new Date(a.at).toLocaleTimeString()}</span>
          <span className={`shrink-0 ${a.actor === "agent" ? "text-[var(--accent)]" : "text-sky-400"}`}>{a.actor}</span>
          <span className="shrink-0">{a.action}</span>
          <span className="min-w-0 truncate text-[var(--txt-dim)]">{a.resource}</span>
          <span className={`ml-auto shrink-0 ${/ok$/i.test(a.result || "") ? "text-emerald-400" : /error|failed|denied/i.test(a.result || "") ? "text-red-400" : ""}`}>{a.result}</span>
        </div>
      ))}
      {!activity.length && <p className="font-sans text-[var(--txt-dim)]">Activity will appear here as you and the agent work.</p>}
    </div>
  );
}

/* -------------------------------------------------------------- Audit ---- */
function AuditPanel() {
  const [lines, setLines] = useState([]);
  const load = useCallback(async () => {
    const r = await fetch("/api/pc", { method: "POST", headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" }, body: JSON.stringify({ op: "audit", limit: 120 }) }).then((r) => r.json());
    setLines(r?.lines || []);
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);
  return (
    <div className="p-3 font-mono text-[10.5px] leading-relaxed text-[var(--txt-dim)]">
      {lines.slice().reverse().map((l, i) => (
        <div key={i} className={`whitespace-pre-wrap ${/DENY|BLOCK/.test(l) ? "text-red-400" : /ALLOW/.test(l) ? "text-amber-300" : ""}`}>{l}</div>
      ))}
      {!lines.length && <p className="font-sans">Bridge audit log is empty.</p>}
    </div>
  );
}

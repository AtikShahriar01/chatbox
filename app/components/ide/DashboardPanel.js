"use client";

// Project Dashboard (master §20/§53/§54 / UI spec §3) — real health data from
// the bridge: framework, deps, scripts, git state, structure, tips.

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard, RefreshCw, GitBranch, Package, Cpu, Globe, Sparkles,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";

export default function DashboardPanel({ workspace, onOpenFile }) {
  const [info, setInfo] = useState(null);
  const [git, setGit] = useState(null);
  const [procs, setProcs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [i, g, p] = await Promise.all([
      pc("/project/inspect", { cwd: workspace }),
      pc("/git/status", { cwd: workspace }),
      pc("/proc/list"),
    ]);
    setInfo(i?.ok ? i : null);
    setGit(g);
    setProcs(p?.procs || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !info) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--txt-dim)]">
        <RefreshCw size={14} className="mr-2 animate-spin" /> analyzing project…
      </div>
    );
  }

  const changed = (git?.stdout || "").split("\n").filter((l) => l.trim() && !l.startsWith("##")).length;
  const hasGit = git?.exitCode !== undefined && git?.exitCode === 0;
  const running = procs.filter((p) => p.status === "running");
  const topExt = Object.entries(info.stats?.byExt || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const deps = Object.keys({ ...(info.dependencies || {}), ...(info.devDependencies || {}) });

  const tips = [];
  if (!hasGit) tips.push("No git repository — run `git init` so the agent can create safe checkpoints.");
  if (!info.buildCommand && info.framework === "Next.js") tips.push("No build script found in package.json — add one for validation runs.");
  if (!info.testCommand) tips.push("No test script — adding `npm test` lets the agent self-heal with real validation.");
  if ((info.stats?.byExt?.[".env"] || 0) > 0 || (info.stats?.byExt?.[".env.local"] || 0) > 0) tips.push(".env file detected — it is redacted from agent output; never commit it.");
  if (!deps.length) tips.push("No dependencies declared — is package.json present in this workspace?");
  if (deps.length > 60) tips.push(`${deps.length} dependencies — consider pruning unused ones (ask the agent: "clean unused dependencies").`);
  if (info.envExampleKeys?.length) tips.push(`Env template found (${info.envExampleKeys.slice(0, 4).join(", ")}${info.envExampleKeys.length > 4 ? "…" : ""}) — document required vars in README.`);
  if (tips.length === 0) tips.push("Project looks healthy. Ask the agent for a full code review or security review anytime.");

  const health = [
    { label: "Framework", ok: !!info.framework, value: info.framework || "unknown", icon: Globe },
    { label: "Git", ok: hasGit, value: hasGit ? `${changed} changed` : "no repo", icon: GitBranch },
    { label: "Deps", ok: deps.length > 0, value: String(deps.length), icon: Package },
    { label: "Dev server", ok: running.length > 0, value: running.length ? `:${running[0].port || "?"}` : "not running", icon: Cpu },
  ];

  return (
    <div className="h-full overflow-auto p-4 text-[var(--txt)]">
      <div className="mb-3 flex items-center gap-2">
        <LayoutDashboard size={15} className="text-[var(--accent)]" />
        <h2 className="text-[14px] font-semibold">Project Dashboard</h2>
        <button onClick={load} className="ml-auto rounded p-1.5 hover:bg-white/10"><RefreshCw size={13} /></button>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        {health.map((h, i) => (
          <motion.div key={h.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-[var(--txt-dim)]">
              {h.ok ? <CheckCircle2 size={11} className="text-emerald-400" /> : <AlertTriangle size={11} className="text-amber-400" />}
              {h.label}
            </div>
            <p className="truncate text-[15px] font-semibold">{h.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Commands</p>
          <p className="font-mono">dev: {info.devCommand || "—"}</p>
          <p className="font-mono">build: {info.buildCommand || "—"}</p>
          <p className="font-mono">test: {info.testCommand || "—"}</p>
          <p className="mt-1 text-[11px] text-[var(--txt-dim)]">package manager: {info.packageManager || "—"} · language: {info.language || "—"}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--txt-dim)]">Structure</p>
          <p>{info.stats?.files} files · {info.stats?.dirs} dirs</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--txt-dim)]">{topExt.map(([e, n]) => `${e || "∅"}:${n}`).join("  ")}</p>
          <p className="mt-1 text-[11px] text-[var(--txt-dim)]">top: {(info.topDirs || []).join(", ") || "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.06] p-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
          <Sparkles size={12} /> Project tips
        </p>
        <ol className="list-inside list-decimal space-y-1 text-[12px] leading-relaxed">
          {tips.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      </div>
    </div>
  );
}

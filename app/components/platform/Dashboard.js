"use client";

// Dashboard (spec-5 §DASHBOARD) — productivity launchpad. Everything is real:
// bridge status, running task, project health, recent tasks, usage, activity,
// security alerts, quick actions.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Play, Code2, ListChecks, ShieldCheck, ShieldAlert, Coins, Cpu, FolderGit2,
  GitBranch, CheckCircle2, XCircle, Loader2, ArrowRight, Package,
} from "lucide-react";
import { bridgeStatus, pc } from "@/lib/pc";
import { useIde, TASK_STATUS } from "@/lib/ide-store";
import { useStore } from "@/lib/store";
import { SkeletonList } from "../platform/States";
import { deriveAgentState } from "../platform/AgentStatus";

const STATUS_ICON = {
  running: Loader2, planning: Loader2, testing: Loader2, fixing: Loader2,
  completed: CheckCircle2, failed: XCircle, cancelled: XCircle,
};

export default function Dashboard() {
  const tasks = useIde((s) => s.tasks);
  const activity = useIde((s) => s.activity);
  const pending = useIde((s) => s.pendingApprovals);
  const [agent, setAgent] = useState(null);
  const [info, setInfo] = useState(null);
  const [git, setGit] = useState(null);
  const store = useStore();

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await bridgeStatus();
      if (!alive) return;
      setAgent(s);
      if (s?.ok) {
        const [i, g] = await Promise.all([pc("/project/inspect"), pc("/git/status")]);
        if (!alive) return;
        setInfo(i?.ok ? i : null);
        setGit(g);
      }
    })();
    const iv = setInterval(async () => { const s = await bridgeStatus(); if (alive) setAgent(s); }, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const online = !!agent?.ok;
  const changed = (git?.stdout || "").split("\n").filter((l) => l.trim() && !l.startsWith("##")).length;
  const runningTask = tasks.find((t) => ["running", "planning", "testing", "fixing"].includes(t.status));
  const recent = tasks.slice(0, 5);
  const alerts = [];
  if (pending.length) alerts.push({ text: `${pending.length} approval${pending.length > 1 ? "s" : ""} waiting`, risk: "high", tab: "agent" });
  if (!online) alerts.push({ text: "Local Agent offline — start agent-bridge/server.js", risk: "medium", tab: null });
  if (git && git.exitCode !== 0) alerts.push({ text: "Project has no git repo — checkpoints use file snapshots", risk: "low", tab: null });

  const u = store.todayUsage || {};
  const m = store.monthlyUsage || {};
  const cards = [
    { label: "Agent", value: online ? "ONLINE" : "OFFLINE", sub: agent?.workspace?.split(/[\\/]/).pop() || "no workspace", href: "/console/agent", icon: Cpu, good: online },
    { label: "Active task", value: runningTask ? runningTask.title.slice(0, 26) : "none", sub: runningTask ? runningTask.status : "start one below", href: "/console/tasks", icon: ListChecks, good: !!runningTask },
    { label: "Project", value: info?.framework || "unknown", sub: `${info?.stats?.files ?? "—"} files · git: ${git && git.exitCode === 0 ? `${changed} changed` : "no repo"}`, href: "/ide", icon: FolderGit2, good: !!info },
    { label: "Today's usage", value: `৳${(u.valueBDT || 0).toFixed(2)}`, sub: `✦ ${(u.valueUSDT || 0).toFixed(4)} USDT · $${(u.costUSD || 0).toFixed(3)} · ${u.requests || 0} req`, href: "/console/usage", icon: Coins, good: true },
  ];

  const quick = [
    { label: "Open IDE", icon: Code2, href: "/ide", primary: true },
    { label: "New task", icon: Play, href: "/console/tasks" },
    { label: "Agent control", icon: Cpu, href: "/console/agent" },
    { label: "Security", icon: ShieldCheck, href: "/console/security" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      {/* greeting */}
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Dashboard</h1>
        <p className="text-[12.5px]" style={{ color: "var(--txt-dim)" }}>
          {online ? "Local Agent connected — your PC is ready for tasks." : "Local Agent is offline. Start agent-bridge to enable PC tasks."}
        </p>
      </div>

      {/* status cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link href={c.href} className="block rounded-2xl border p-3.5 ide-transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--border)", background: "var(--panel-bg)", boxShadow: "var(--shadow-1)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--txt-faint)" }}>{c.label}</span>
                <c.icon size={13} style={{ color: c.good ? "var(--accent)" : "var(--txt-dim)" }} />
              </div>
              <p className="truncate text-[14.5px] font-bold">{c.value}</p>
              <p className="truncate text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{c.sub}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* alerts */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]"
              style={{ borderColor: "color-mix(in srgb, var(--warn) 35%, transparent)", background: "color-mix(in srgb, var(--warn) 8%, transparent)" }}>
              <ShieldAlert size={13} style={{ color: "var(--warn)" }} />
              <span className="flex-1">{a.text}</span>
              {a.tab && <Link href="/console/agent" className="rounded-lg px-2 py-0.5 text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--warn) 18%, transparent)" }}>Review</Link>}
            </div>
          ))}
        </div>
      )}

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.label} href={q.href}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold ide-transition hover:opacity-90"
            style={q.primary
              ? { background: "var(--accent)", color: "white" }
              : { border: "1px solid var(--border)", background: "var(--surface)", color: "var(--txt)" }}>
            <q.icon size={14} /> {q.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* recent tasks */}
        <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
            <ListChecks size={13} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-semibold">Recent tasks</h2>
            <Link href="/console/tasks" className="ml-auto flex items-center gap-1 text-[11px]" style={{ color: "var(--accent)" }}>All tasks <ArrowRight size={11} /></Link>
          </header>
          {recent.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--txt-dim)" }}>
              No tasks yet — give the agent its first job from the <Link href="/console/agent" style={{ color: "var(--accent)" }}>Agent page</Link>.
            </div>
          ) : recent.map((t) => {
            const Icon = STATUS_ICON[t.status] || ListChecks;
            const spin = ["running", "planning", "testing", "fixing"].includes(t.status);
            return (
              <Link key={t.id} href="/console/tasks" className="flex items-center gap-2.5 border-b px-4 py-2.5 last:border-0 hover:bg-white/[0.04]" style={{ borderColor: "var(--border)" }}>
                <Icon size={13} className={spin ? "animate-spin text-sky-400" : t.status === "completed" ? "text-emerald-400" : t.status === "failed" ? "text-red-400" : ""} style={!spin && t.status !== "completed" && t.status !== "failed" ? { color: "var(--txt-dim)" } : {}} />
                <span className="min-w-0 flex-1 truncate text-[12px]">{t.title}</span>
                <span className="text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{t.status}</span>
              </Link>
            );
          })}
        </section>

        {/* activity */}
        <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
            <GitBranch size={13} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-semibold">Recent activity</h2>
          </header>
          <div className="max-h-56 overflow-auto px-4 py-2">
            {activity.slice(0, 12).map((a) => (
              <div key={a.id} className="flex items-baseline gap-2 py-1 text-[11.5px]">
                <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--txt-faint)" }}>{new Date(a.at).toLocaleTimeString()}</span>
                <span className="shrink-0 font-semibold" style={{ color: a.actor === "agent" ? "var(--accent)" : "var(--info)" }}>{a.actor}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--txt-dim)" }}>{a.action} {a.resource}</span>
                <span className="shrink-0 text-[10px]" style={{ color: /error|failed|denied/i.test(a.result || "") ? "var(--err)" : "var(--ok)" }}>{a.result}</span>
              </div>
            ))}
            {!activity.length && <p className="py-4 text-center text-[12px]" style={{ color: "var(--txt-dim)" }}>Activity will stream here as the agent works.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

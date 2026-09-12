"use client";

// Console layout (spec-5 §GLOBAL LAYOUT / §PRIMARY NAVIGATION) — collapsible
// sidebar: logo, workspace switcher, nav (Dashboard, Tasks, Agent, Security,
// Usage), agent status pill, profile. Drawer on mobile.
// Navigation is STATE-BASED (sections swap in place, no route reload) and the
// console itself mounts once inside the unified app shell.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard, ListChecks, Cpu, ShieldCheck, Coins, Code2, MessageSquareText,
  PanelLeftClose, PanelLeftOpen, Menu, X, FolderGit2,
} from "lucide-react";
import { bridgeStatus, pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import { useUi } from "@/lib/ui-store";
import AgentStatus, { deriveAgentState } from "./AgentStatus";
import ViewSwitcher from "./ViewSwitcher";

import Dashboard from "./Dashboard";
import TasksPage from "./TasksPage";
import AgentPage from "./AgentPage";
import SecurityPage from "./SecurityPage";
import UsagePage from "./UsagePage";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "agent", label: "Agent", icon: Cpu },
  { key: "security", label: "Security", icon: ShieldCheck },
  { key: "usage", label: "Usage", icon: Coins },
];

export default function PlatformShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [section, setSection] = useState("dashboard");
  const [agent, setAgent] = useState({ connected: false, workspace: "", mode: "ask" });
  const [fails, setFails] = useState(0);
  const [device, setDevice] = useState(null);
  const tasks = useIde((s) => s.tasks);
  const pending = useIde((s) => s.pendingApprovals);
  const runningTask = tasks.some((t) => ["running", "planning", "testing", "fixing"].includes(t.status));

  useEffect(() => {
    let alive = true;
    const beat = async () => {
      try {
        const [s, sys] = await Promise.all([bridgeStatus(), pc("/sysinfo").catch(() => null)]);
        if (!alive) return;
        setFails(0);
        setAgent({ connected: !!s?.ok, workspace: s?.workspace || "", mode: s?.mode || "ask" });
        if (sys?.ok) setDevice({ platform: sys.platform, arch: sys.arch, running: sys.runningProcs, heartbeat: new Date().toLocaleTimeString() });
      } catch {
        if (alive) setFails((f) => f + 1);
      }
    };
    beat();
    const iv = setInterval(beat, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const state = deriveAgentState({ connected: agent.connected, pending: pending.length, runningTask, pollFails: fails });

  const NavList = ({ onNavigate }) => (
    <nav className="space-y-0.5" aria-label="Primary">
      {NAV.map((n) => {
        const active = section === n.key;
        return (
          <button key={n.key} onClick={() => { setSection(n.key); onNavigate?.(); }} title={n.label}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium ide-transition ${active ? "" : "hover:bg-white/[0.06]"}`}
            style={active ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" } : { color: "var(--txt-dim)" }}
            aria-current={active ? "page" : undefined}>
            <n.icon size={15} className="shrink-0" />
            {!collapsed && <span className="truncate">{n.label}</span>}
            {!collapsed && n.key === "tasks" && runningTask && (
              <span className="ml-auto rounded-full px-1.5 text-[9.5px] font-bold" style={{ background: "color-mix(in srgb, var(--info) 20%, transparent)", color: "var(--info)" }}>RUN</span>
            )}
          </button>
        );
      })}
      <div className="my-1.5 border-t" style={{ borderColor: "var(--border)" }} />
      <button onClick={() => { useUi.getState().setView("ide"); onNavigate?.(); }} title="Open IDE workspace"
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium ide-transition hover:bg-white/[0.06]" style={{ color: "var(--txt-dim)" }}>
        <Code2 size={15} className="shrink-0" style={{ color: "var(--accent)" }} />
        {!collapsed && <span>Workspace (IDE)</span>}
      </button>
      <button onClick={() => { useUi.getState().setView("chat"); onNavigate?.(); }} title="AI Chat"
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium ide-transition hover:bg-white/[0.06]" style={{ color: "var(--txt-dim)" }}>
        <MessageSquareText size={15} className="shrink-0" />
        {!collapsed && <span>Conversations</span>}
      </button>
    </nav>
  );

  const sidebarInner = (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 px-3 py-3.5 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #9333ea))" }}>
          <FolderGit2 size={14} color="white" />
        </div>
        {!collapsed && <span className="text-[13.5px] font-bold tracking-tight">Agent Console</span>}
        <button className="ml-auto rounded-lg p-1.5 hover:bg-white/10 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={15} />
        </button>
      </div>

      {/* workspace switcher (spec-5 §SIDEBAR) */}
      {!collapsed && (
        <div className="mx-3 mb-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>
          <p className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--txt-faint)" }}>Workspace</p>
          <p className="truncate font-mono text-[11px]" title={agent.workspace} style={{ color: "var(--txt)" }}>
            {agent.workspace?.split(/[\\/]/).pop() || "not connected"}
          </p>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto px-2 ${collapsed ? "px-1.5" : ""}`}>
        <NavList onNavigate={() => setMobileOpen(false)} />
      </div>

      <div className={`border-t p-3 ${collapsed ? "flex justify-center" : ""}`} style={{ borderColor: "var(--border)" }}>
        <AgentStatus state={state} detail={{ ...agent, ...device }} compact={collapsed} />
      </div>
    </div>
  );

  const Section = { dashboard: Dashboard, tasks: TasksPage, agent: AgentPage, security: SecurityPage, usage: UsagePage }[section];

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--bg)", color: "var(--txt)" }}>
      {/* desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 56 : 228 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-10 hidden shrink-0 border-r md:block"
        style={{ borderColor: "var(--border)", background: "var(--cb-sidebar)" }}
      >
        {sidebarInner}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 z-20 rounded-full border p-1 shadow-md hover:scale-110"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
        </button>
      </motion.aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="fixed inset-y-0 left-0 z-[71] w-60 border-r md:hidden"
              style={{ borderColor: "var(--border)", background: "var(--cb-sidebar)" }}>
              {sidebarInner}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--border)" }}>
          <button className="rounded-lg p-1.5 hover:bg-white/10 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <p className="text-[12.5px] font-semibold">
            {NAV.find((n) => n.key === section)?.label || "Console"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <ViewSwitcher compact />
            <span className="hidden truncate font-mono text-[10.5px] lg:block" style={{ color: "var(--txt-faint)" }} title={agent.workspace}>
              {agent.workspace || "bridge offline — start agent-bridge/server.js"}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="h-full"
            >
              <Section />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

"use client";

// IDE shell (master §57/§58/§43/§44 / UI spec §4) — LEFT explorer · CENTER
// editor/preview/dashboard · RIGHT agent · BOTTOM terminal/problems/git.
// Resizable + collapsible, layout persists, keyboard shortcuts wired.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderTree, Code2, Globe, LayoutDashboard, TerminalSquare, MessageSquareText,
  Search, PanelLeftClose, PanelLeftOpen, PanelBottomOpen, PanelBottomClose,
  MessagesSquare, Link2, ChevronDown, Bot, Keyboard,
} from "lucide-react";
import { bridgeStatus } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import { useUi } from "@/lib/ui-store";
import { useStore } from "@/lib/store";
import ViewSwitcher from "@/components/platform/ViewSwitcher";

import FileExplorer from "./FileExplorer";
import EditorTabs from "./EditorTabs";
import BottomPanel from "./BottomPanel";
import AgentPanel from "./AgentPanel";

const PreviewPane = dynamic(() => import("./PreviewPane"), { ssr: false });
const DashboardPanel = dynamic(() => import("./DashboardPanel"), { ssr: false });

export default function IdeLayout() {
  const panels = useIde((s) => s.panels);
  const setPanel = useIde((s) => s.setPanel);
  const setCenterTab = useIde((s) => s.setCenterTab);
  const setBottomTab = useIde((s) => s.setBottomTab);
  const openTab = useIde((s) => s.openTab);
  const bridge = useIde((s) => s.bridge);
  const setBridge = useIde((s) => s.setBridge);
  const tabCount = useIde((s) => s.tabs.length);
  const store = useStore();
  const [ws, setWs] = useState("");
  const [drag, setDrag] = useState(null); // {kind, start, size}
  const [leftW, setLeftW] = useState(240);
  const [rightW, setRightW] = useState(360);
  const [bottomH, setBottomH] = useState(240);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [qs, setQs] = useState("");
  const shellRef = useRef(null);

  // workspace + bridge status
  useEffect(() => {
    (async () => {
      const s = await bridgeStatus();
      setWs(s?.workspace || "");
      setBridge({ connected: !!s?.ok, workspace: s?.workspace || "", mode: s?.mode || "ask" });
    })();
  }, [setBridge]);

  // AI actions from explorer context menu land in the agent console
  const aiTargetRef = useRef(null);

  const onOpenFile = useCallback((full, name, content, opts = {}) => {
    if (full === "__ai__") {
      // jump to agent console with a pre-filled explain request
      setPanel("right", true);
      setCenterTab("editor");
      const ev = new CustomEvent("ide:ai-target", { detail: { name: opts.aiTarget?.name, path: opts.aiTarget?.path } });
      window.dispatchEvent(ev);
      return;
    }
    setCenterTab("editor");
    openTab(full, name, content, { lang: undefined });
  }, [openTab, setCenterTab, setPanel]);

  // panel resizing (mouse drag)
  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      if (drag.kind === "left") setLeftW(Math.min(420, Math.max(160, e.clientX)));
      if (drag.kind === "right") setRightW(Math.min(560, Math.max(260, window.innerWidth - e.clientX)));
      if (drag.kind === "bottom") setBottomH(Math.min(window.innerHeight - 260, Math.max(120, window.innerHeight - e.clientY)));
    };
    const up = () => setDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag]);

  // keyboard shortcuts (master §43 + spec-5 §KEYBOARD SHORTCUTS)
  useEffect(() => {
    const h = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setPanel("left", !panels.left); }
      else if (mod && e.key === "`") { e.preventDefault(); setPanel("bottom", !panels.bottom); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); setPalette(true); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); setCenterTab("search"); setPanel("left", false); }
      else if (e.key === "Escape") { setPalette(false); setShortcuts(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [panels, setPanel, setCenterTab]);

  const commands = [
    { label: "Open File…", fn: () => { setPanel("left", true); } },
    { label: "Toggle Explorer", fn: () => setPanel("left", !panels.left) },
    { label: "Toggle Terminal", fn: () => setPanel("bottom", !panels.bottom) },
    { label: "Show Terminal", fn: () => setBottomTab("terminal") },
    { label: "Show Git", fn: () => setBottomTab("git") },
    { label: "Show Activity Log", fn: () => setBottomTab("audit") },
    { label: "Show Processes", fn: () => setBottomTab("processes") },
    { label: "Open Preview", fn: () => setCenterTab("preview") },
    { label: "Project Dashboard", fn: () => setCenterTab("dashboard") },
    { label: "Toggle Agent Panel", fn: () => setPanel("right", !panels.right) },
    { label: "Back to Chat", fn: () => { useUi.getState().setView("chat"); } },
    { label: "Keyboard Shortcuts", fn: () => setShortcuts(true) },
  ];

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(qs.toLowerCase()));

  return (
    <div ref={shellRef} className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--txt)]">
      {/* ---------------------------------------------------------- top bar */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/5 bg-black/20 px-3">
        <button onClick={() => useUi.getState().setView("chat")} title="Back to chat" aria-label="Back to chat"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12.5px] font-semibold hover:bg-white/10">
          <Bot size={16} className="text-[var(--accent)]" /> Chatbox <span className="font-normal text-[var(--txt-dim)]">IDE</span>
        </button>
        <ViewSwitcher compact />
        <div className="mx-2 h-4 w-px bg-white/10" />
        <button onClick={() => setPanel("left", !panels.left)} title="Explorer (Ctrl+B)" className="rounded p-1.5 hover:bg-white/10">
          {panels.left ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>
        <button onClick={() => setPanel("bottom", !panels.bottom)} title="Terminal (Ctrl+`)" className="rounded p-1.5 hover:bg-white/10">
          <PanelBottomOpen size={14} />
        </button>
        <button onClick={() => setPalette(true)} className="flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1 text-[11.5px] text-[var(--txt-dim)] hover:bg-black/40">
          <Search size={11} /> Commands <kbd className="rounded bg-white/10 px-1 text-[9.5px]">Ctrl+K</kbd>
        </button>

        <div className="mx-auto flex items-center gap-1 rounded-lg bg-black/25 px-3 py-1 text-[11.5px]">
          <FolderTree size={11} className="text-[var(--accent)]" />
          <span className="max-w-72 truncate text-[var(--txt-dim)]" title={ws}>{ws || "connecting to agent…"}</span>
        </div>

        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] ${bridge.connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${bridge.connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          {bridge.connected ? "Agent online" : "Agent offline"}
        </span>
        <button onClick={() => setShortcuts(true)} title="Shortcuts" className="rounded p-1.5 hover:bg-white/10"><Keyboard size={14} /></button>
      </header>

      {/* ----------------------------------------------------------- body */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT: explorer */}
        {panels.left && (
          <div style={{ width: leftW }} className="shrink-0 border-r border-white/5">
            <FileExplorer workspace={ws} onOpenFile={onOpenFile} />
          </div>
        )}
        {panels.left && <DragBar onDown={() => setDrag({ kind: "left" })} />}

        {/* CENTER */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/5 bg-black/10 px-2">
            {[
              { k: "editor", label: "Code", icon: Code2 },
              { k: "preview", label: "Preview", icon: Globe },
              { k: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            ].map((t) => (
              <button key={t.k} onClick={() => setCenterTab(t.k)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11.5px] ${panels.centerTab === t.k ? "bg-white/10 text-[var(--txt)]" : "text-[var(--txt-dim)] hover:bg-white/5"}`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
            {!panels.bottom && (
              <button onClick={() => setPanel("bottom", true)} className="ml-auto rounded p-1 hover:bg-white/10" title="Show terminal">
                <PanelBottomClose size={14} />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {panels.centerTab === "editor" && <EditorTabs workspace={ws} aiTargetRef={aiTargetRef} />}
            {panels.centerTab === "preview" && <PreviewPane />}
            {panels.centerTab === "dashboard" && <DashboardPanel workspace={ws} onOpenFile={onOpenFile} />}
          </div>

          {/* BOTTOM panel */}
          {panels.bottom && (
            <>
              <DragBar horizontal onDown={() => setDrag({ kind: "bottom" })} />
              <div style={{ height: bottomH }} className="shrink-0 border-t border-white/5">
                <BottomPanel workspace={ws} onOpenFile={onOpenFile} />
              </div>
            </>
          )}
        </div>

        {/* RIGHT: agent */}
        {panels.right && <DragBar onDown={() => setDrag({ kind: "right" })} />}
        {panels.right && (
          <div style={{ width: rightW }} className="shrink-0 border-l border-white/5">
            <AgentPanel workspace={ws} agentRef={{ current: null }} />
          </div>
        )}
      </div>

      {/* -------------------------------------------------- command palette */}
      <AnimatePresence>
        {palette && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-start justify-center pt-24" style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={(e) => e.target === e.currentTarget && setPalette(false)}>
            <motion.div initial={{ scale: 0.97, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
              className="w-[420px] overflow-hidden rounded-xl border border-white/10 bg-[var(--panel-bg)] shadow-2xl backdrop-blur-xl">
              <input autoFocus value={qs} onChange={(e) => setQs(e.target.value)} placeholder="Type a command…"
                className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-[13px] outline-none" />
              <div className="max-h-72 overflow-auto py-1">
                {filtered.map((c) => (
                  <button key={c.label} className="block w-full px-4 py-2 text-left text-[13px] hover:bg-white/10"
                    onClick={() => { setPalette(false); setQs(""); c.fn(); }}>
                    {c.label}
                  </button>
                ))}
                {!filtered.length && <p className="px-4 py-3 text-[12px] text-[var(--txt-dim)]">No matching command</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
        {shortcuts && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={(e) => e.target === e.currentTarget && setShortcuts(false)}>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="w-[380px] rounded-2xl border border-white/10 bg-[var(--panel-bg)] p-5 shadow-2xl">
              <h3 className="mb-3 text-[14px] font-semibold">Keyboard shortcuts</h3>
              {[
                ["Ctrl+Shift+P", "Command palette"], ["Ctrl+B", "Toggle explorer"], ["Ctrl+`", "Toggle terminal"],
                ["Ctrl+S", "Save file"], ["Ctrl+Shift+F", "Global search"], ["Ctrl+Enter", "Run agent task"], ["Esc", "Close dialogs"],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between py-1.5 text-[12.5px]">
                  <span className="text-[var(--txt-dim)]">{d}</span>
                  <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px]">{k}</kbd>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* status bar (UI spec §3 bottom) */}
      <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-white/5 bg-black/20 px-3 text-[10.5px] text-[var(--txt-dim)]">
        <Link2 size={10} /> bridge :8765
        <span>· mode: {bridge.mode}</span>
        <span className="ml-auto">{tabCount} open files</span>
      </footer>
    </div>
  );
}

function DragBar({ onDown, horizontal }) {
  return (
    <div
      onMouseDown={onDown}
      className={horizontal
        ? "h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-[var(--accent)]/40"
        : "w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent)]/40"}
    />
  );
}

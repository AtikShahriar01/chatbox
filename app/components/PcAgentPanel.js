"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck, ShieldAlert, Loader2, RefreshCw, Check, X, Terminal,
  FolderOpen, FileText, Trash2, HardDrive, Activity, Lock, Unlock,
} from "lucide-react";
import { useStore } from "@/lib/store";

async function pc(op, params = {}) {
  const res = await fetch("/api/pc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chatbox-client": "chatbox-web-1", // required by the /api/pc guard
    },
    body: JSON.stringify({ op, ...params }),
  });
  return res.json();
}

const MODES = [
  { key: "ask", label: "Ask every time", desc: "প্রতিটা কাজে অনুমতি চাইবে (সবচেয়ে নিরাপদ)", icon: Lock },
  { key: "safe", label: "Auto-allow reads", desc: "শুধু পড়া/লিস্ট অটো — লেখা/কমান্ডে অনুমতি চাইবে", icon: ShieldCheck },
  { key: "auto", label: "Full auto", desc: "সব অটো (নিজের দায়িত্বে — সাবধান!)", icon: Unlock },
];

export default function PcAgentPanel() {
  const pushToast = useStore((s) => s.pushToast);
  const [status, setStatus] = useState(null); // { ok, mode, pending, workspace } | null
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState("ask");
  const [pendingList, setPendingList] = useState([]);
  const [testPath, setTestPath] = useState("");
  const [output, setOutput] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [wsInput, setWsInput] = useState("");
  const setSetting = useStore((s) => s.setSetting);

  const refresh = async () => {
    setChecking(true);
    const st = await pc("status");
    setStatus(st);
    setMode(st.ok ? st.mode || "ask" : "ask");
    if (st.ok) {
      const p = await pc("pending"); // "pending" (no slash) → GET on the bridge
      setPendingList(p.ok ? p.pending || [] : []);
      const w = await pc("workspace"); // GET — POST /workspace would CLEAR it
      if (w.ok) { setWorkspace(w.workspace || ""); setWsInput(w.workspace || ""); }
      useStore.getState().setSetting("pcWorkspace", w.workspace || "");
    }
    setChecking(false);
  };

  useEffect(() => { refresh(); }, []);

  const setBridgeMode = async (m) => {
    const r = await pc("/mode", { mode: m });
    if (r.ok) { setMode(m); pushToast({ type: "success", message: `PC access mode: ${m}` }); refresh(); }
    else pushToast({ type: "error", message: "Could not set mode." });
  };

  const respond = async (id, allow) => {
    const r = await pc("/approve", { id, allow });
    if (r.ok) pushToast({ type: allow ? "success" : "info", message: allow ? "Approved." : "Denied." });
    refresh();
  };

  const testList = async () => {
    if (!testPath.trim()) return;
    setOutput("(loading…)");
    const r = await pc("/file/list", { path: testPath.trim() });
    setOutput(r.ok
      ? r.entries.map((e) => (e.dir ? "📁 " : "📄 ") + e.name).join("\n")
      : "Error: " + (r.error || "unknown"));
    refresh();
  };

  const running = status?.ok;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight">PC Access</h3>
        <button onClick={refresh} className="cb-focus p-1.5 rounded hover:bg-cb-surface" aria-label="Refresh">
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="text-sm" style={{ color: "var(--cb-muted)" }}>
        Agent-রা user-এর অনুমতি নিয়ে এই PC-তে সত্যিকারের কাজ করতে পারে — ফাইল বানানো/পড়া/লেখা, কমান্ড চালানো।
        প্রতিটা কাজ আপনার চোখের সামনে + অডিট লগে থাকে।
      </p>

      {/* Status card */}
      <div
        className="rounded-lg p-3.5 flex items-center gap-3"
        style={{
          background: running ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${running ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
        }}
      >
        {running ? (
          <ShieldCheck size={20} style={{ color: "#22c55e" }} className="shrink-0" />
        ) : checking ? (
          <Loader2 size={20} className="animate-spin shrink-0" style={{ color: "var(--cb-muted)" }} />
        ) : (
          <ShieldAlert size={20} style={{ color: "#ef4444" }} className="shrink-0" />
        )}
        <div className="flex-1">
          <div className="text-sm font-medium">
            {running ? "Bridge connected — PC access সক্রিয়" : checking ? "Checking…" : "Bridge চালু নেই"}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--cb-muted)" }}>
            {running
              ? `Mode: ${mode} · Pending requests: ${pendingList.length} · localhost:8765`
              : "start-app.bat চালু করুন — bridge এমনিই সাথে চলবে। (agent-bridge ফোল্ডার)"}
          </div>
        </div>
      </div>

      {/* Workspace root — agents are confined here (ZCode "open folder") */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--cb-muted)" }}>
          Workspace folder — agent-রা এই ফোল্ডারের ভেতরে কাজ করবে
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={wsInput}
            onChange={(e) => setWsInput(e.target.value)}
            placeholder="H:\my-project (খালি = সীমাবদ্ধ না)"
            className="cb-focus flex-1 px-3 py-2 rounded-md text-xs outline-none font-mono"
            style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
          />
          <button
            onClick={async () => {
              const r = await pc("/workspace", { path: wsInput.trim() || null });
              if (r.ok) { setWorkspace(r.workspace); pushToast({ type: "success", message: r.workspace ? `Workspace: ${r.workspace}` : "Workspace cleared." }); }
              else pushToast({ type: "error", message: r.error || "Could not set workspace." });
            }}
            disabled={!running}
            className="cb-focus px-3 py-2 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ background: "var(--cb-accent)", color: "white" }}
          >
            Set
          </button>
        </div>
        {workspace && (
          <div className="text-[10.5px] mt-1.5 font-mono" style={{ color: "#22c55e" }}>
            ✓ Confined to: {workspace}
          </div>
        )}
      </div>

      {/* Permission mode */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--cb-muted)" }}>
          Permission mode
        </div>
        <div className="grid gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key && running;
            return (
              <button
                key={m.key}
                onClick={() => setBridgeMode(m.key)}
                disabled={!running}
                className="cb-focus text-left p-3 rounded-lg flex items-start gap-2.5 transition-colors disabled:opacity-50"
                style={{
                  background: active ? "color-mix(in srgb, var(--cb-accent) 10%, transparent)" : "var(--cb-surface)",
                  border: `1px solid ${active ? "color-mix(in srgb, var(--cb-accent) 40%, transparent)" : "var(--cb-border)"}`,
                }}
              >
                <Icon size={15} className="shrink-0 mt-0.5" style={{ color: active ? "var(--cb-accent)" : "var(--cb-muted)" }} />
                <span>
                  <span className="block text-xs font-medium">{m.label}</span>
                  <span className="block text-[10.5px] mt-0.5" style={{ color: "var(--cb-muted)" }}>{m.desc}</span>
                </span>
                {active && <Check size={13} className="shrink-0 ml-auto" style={{ color: "var(--cb-accent)" }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending approvals */}
      <AnimatePresence>
        {pendingList.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-lg p-3 space-y-2"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
              <Activity size={13} /> Agent অনুমতি চাইছে ({pendingList.length})
            </div>
            {pendingList.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <Terminal size={11} className="shrink-0" style={{ color: "var(--cb-muted)" }} />
                <span className="flex-1 truncate font-mono">{p.summary}</span>
                <button onClick={() => respond(p.id, true)}
                  className="cb-focus px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: "#22c55e", color: "white" }}>
                  Allow
                </button>
                <button onClick={() => respond(p.id, false)}
                  className="cb-focus px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: "#ef4444", color: "white" }}>
                  Deny
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick test */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--cb-muted)" }}>
          টেস্ট — ফোল্ডার দেখুন
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={testPath}
            onChange={(e) => setTestPath(e.target.value)}
            placeholder="C:\Users\Atik\Desktop বা ~"
            className="cb-focus flex-1 px-3 py-2 rounded-md text-xs outline-none font-mono"
            style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
          />
          <button
            onClick={testList}
            disabled={!running}
            className="cb-focus px-3 py-2 rounded-md text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--cb-accent)", color: "white" }}
          >
            <FolderOpen size={12} /> List
          </button>
        </div>
        {output && (
          <pre className="mt-2 p-3 rounded-md text-[10.5px] font-mono max-h-44 overflow-auto whitespace-pre-wrap"
            style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-text)" }}>
            {output}
          </pre>
        )}
      </div>

      <div className="text-[10.5px] rounded-lg p-2.5 flex items-start gap-1.5" style={{ background: "var(--cb-surface)", color: "var(--cb-muted)" }}>
        <HardDrive size={12} className="shrink-0 mt-0.5" />
        সব action <code>agent-bridge/audit.log</code>-এ লগ হয়। Bridge শুধু localhost-এ চলে — বাইরের কেউ access করতে পারে না।
      </div>
    </div>
  );
}

"use client";

// Agent Output popup — three tabs:
//   FILES: everything the agent makes — code (Monaco), pptx slide previews,
//          audio/video/image players — all visible in real time
//   LOG:   live action feed — every PC access, file op, command
//   APPROVALS: pending permission requests in ask mode (approve/deny)

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { X, Minus, FileCode, Sparkles, ScrollText, ShieldCheck, ShieldAlert, Loader2, Copy, Download, Save, Check } from "lucide-react";
import { useCodeWindow } from "@/lib/code-window-store";
import { useStore } from "@/lib/store";
import { langOf, pc } from "@/lib/pc";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-[11px] text-[var(--txt-dim)]">loading…</div>,
});

const KIND_COLOR = {
  write: "#4ade80", edit: "#38bdf8", create: "#a78bfa", delete: "#f87171",
  exec: "#fbbf24", run: "#fbbf24", read: "#94a3b8", list: "#94a3b8",
  search: "#c084fc", git: "#34d399", ckpt: "#f472b6", term: "#60a5fa",
};

const extOf = (p = "") => (p.split(".").pop() || "").toLowerCase();
const isImage = (p) => ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extOf(p));
const isAudio = (p) => ["mp3", "wav", "m4a", "ogg"].includes(extOf(p));
const isVideo = (p) => ["mp4", "webm", "mov"].includes(extOf(p));
const isPptx = (p) => extOf(p) === "pptx";

// Visual preview for binary/media files the agent produces: pptx → slide
// images (via /office/preview), audio/video/image → inline players via raw.
function MediaPreview({ path }) {
  const [slides, setSlides] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setSlides(null); setErr(null);
    if (!isPptx(path)) return undefined;
    let dead = false;
    pc("/office/preview", { path })
      .then((r) => { if (!dead) { if (r?.ok) setSlides(r.slides); else setErr(r?.error || "preview failed"); } })
      .catch((e) => { if (!dead) setErr(String(e?.message || e)); });
    return () => { dead = true; };
  }, [path]);

  if (isImage(path)) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/pc/raw?path=${encodeURIComponent(path)}`} alt={path.split(/[\\/]/).pop()} className="max-h-full max-w-full rounded-lg" />
      </div>
    );
  }
  if (isAudio(path)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="text-4xl">🎧</div>
        <div className="text-[11px] text-[var(--txt-dim)]">{path.split(/[\\/]/).pop()}</div>
        <audio controls src={`/api/pc/raw?path=${encodeURIComponent(path)}`} className="w-[90%]" />
      </div>
    );
  }
  if (isVideo(path)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
        <video controls src={`/api/pc/raw?path=${encodeURIComponent(path)}`} className="max-h-full max-w-full rounded-lg" />
      </div>
    );
  }
  if (isPptx(path)) {
    if (err) return <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-[var(--txt-dim)]">প্রিভিউ নেই — {err}</div>;
    if (!slides) return <div className="flex h-full items-center justify-center gap-2 text-[11px] text-[var(--txt-dim)]"><Loader2 size={13} className="animate-spin" /> স্লাইড লোড হচ্ছে…</div>;
    return (
      <div className="h-full space-y-3 overflow-auto p-3">
        {slides.map((src, i) => (
          <div key={i} className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-1 text-[10px] text-[var(--txt-dim)]">স্লাইড {i + 1}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`slide ${i + 1}`} className="w-full" />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function CodeOutputWindow() {
  const { open, minimized, files, activePath, log, setOpen, minimize, setActive } = useCodeWindow();
  const [pos, setPos] = useState({ x: 90, y: 70 });
  const [tab, setTab] = useState("files");
  const [pendingRequests, setPendingRequests] = useState([]);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const dragRef = useRef(null);
  const logEndRef = useRef(null);
  const active = files.find((f) => f.path === activePath) || files[0];
  // §12 code-output actions: copy / download / save-to-project (also line-numbers +
  // language detection via Monaco, filename shown in the toolbar).
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!active) return;
    try { await navigator.clipboard.writeText(String(active.content || "")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const doDownload = () => {
    if (!active) return;
    const blob = new Blob([String(active.content || "")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = active.path.split(/[\\/]/).pop() || "file.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doSave = async () => {
    if (!active) return;
    const r = await pc("/file/write", { path: active.path, content: String(active.content || "") });
    useStore.getState().pushToast(r?.ok ? { type: "success", message: "প্রজেক্টে সেভ হয়েছে: " + (active.path.split(/[\\/]/).pop()) } : { type: "error", message: "সেভ ব্যর্থ: " + (r?.error || "") });
  };

  // ---- pending approvals polling (ask mode) -------------------------------
  const fetchPending = async () => {
    try {
      const r = await pc("/pending", {});
      if (r?.ok) setPendingRequests(r.pending || []);
    } catch {}
  };
  useEffect(() => {
    let alive = true;
    let timer = null;
    const loop = async () => {
      while (alive) {
        try {
          const st = await pc("status", {});
          if (st?.ok && (st.mode === "ask" || st.mode === "safe")) {
            await fetchPending();
            setApprovalsOpen(true);
          } else {
            setPendingRequests([]);
            setApprovalsOpen(false);
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    loop();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const decide = async (id, allow) => {
    try {
      await pc(allow ? "/approve" : "/deny", allow ? { id, allow: true } : { id });
      fetchPending();
    } catch {}
  };
  const approveAll = async () => {
    try { await pc("/approve", { all: true, allow: true }); fetchPending(); } catch {}
  };

  useEffect(() => {
    if (tab === "log" && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log.length, tab]);

  const onMouseDown = (e) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 620, ev.clientX - dragRef.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 120, ev.clientY - dragRef.current.dy)),
      });
    };
    const up = () => { dragRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (!open || (!files.length && !log.length && !pendingRequests.length)) return null;

  const activeTab = tab === "approvals" && !pendingRequests.length ? "files" : tab;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed z-[95] flex flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          left: pos.x, top: pos.y, width: 620, height: minimized ? 42 : 520,
          background: "var(--panel-bg)", border: "1px solid var(--border)",
          backdropFilter: "blur(10px)", boxShadow: "var(--shadow-2)",
        }}
        role="dialog" aria-label="Agent activity"
      >
        {/* title bar */}
        <div onMouseDown={onMouseDown} className="flex h-9 shrink-0 cursor-move items-center gap-2 border-b px-3" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.25)" }}>
          <Sparkles size={13} className="text-[var(--accent)]" />
          <span className="text-[11.5px] font-semibold">Agent Activity</span>
          {pendingRequests.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
              <ShieldAlert size={10} /> {pendingRequests.length} approval
            </span>
          )}
          {files.length > 0 && (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>
              {files.length} files
            </span>
          )}
          {log.length > 0 && !minimized && (
            <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "color-mix(in srgb, #4ade80 15%, transparent)", color: "#4ade80" }}>
              <span className="h-1 w-1 animate-pulse rounded-full bg-current" /> live
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button title="Minimize" className="rounded p-1 hover:bg-white/10" onClick={minimize}><Minus size={12} /></button>
            <button title="Close" className="rounded p-1 hover:bg-white/10" onClick={() => setOpen(false)}><X size={13} /></button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* tab switch */}
            <div className="flex shrink-0 items-center gap-1 border-b bg-black/10 px-2" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setTab("files")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] ${activeTab === "files" ? "border-b-2 border-[var(--accent)] text-[var(--txt)]" : "text-[var(--txt-dim)]"}`}>
                <FileCode size={11} /> Files ({files.length})
              </button>
              <button onClick={() => setTab("log")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] ${activeTab === "log" ? "border-b-2 border-[var(--accent)] text-[var(--txt)]" : "text-[var(--txt-dim)]"}`}>
                <ScrollText size={11} /> Live Log ({log.length})
              </button>
              {approvalsOpen && (
                <button onClick={() => setTab("approvals")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] ${activeTab === "approvals" ? "border-b-2 border-amber-400 text-[var(--txt)]" : "text-[var(--txt-dim)]"}`}>
                  <ShieldCheck size={11} /> Approvals ({pendingRequests.length})
                </button>
              )}
            </div>

            {activeTab === "approvals" && (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {pendingRequests.length === 0 && (
                  <div className="p-4 text-center text-[11px] text-[var(--txt-dim)]">কোনো পেন্ডিং অনুমোদন নেই</div>
                )}
                {pendingRequests.length > 1 && (
                  <button onClick={approveAll}
                    className="mb-2 rounded bg-emerald-500/20 px-3 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/30">
                    ✅ সব অনুমোদন করুন ({pendingRequests.length})
                  </button>
                )}
                {pendingRequests.map((req) => (
                  <motion.div key={req.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-1.5 flex items-center justify-between rounded border bg-black/20 p-2" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-[var(--txt)]">{req.kind}</div>
                      <div className="truncate text-[10px] text-[var(--txt-dim)]">{req.summary}</div>
                    </div>
                    <div className="ml-2 flex gap-1.5">
                      <button onClick={() => decide(req.id, true)}
                        className="rounded bg-emerald-500/20 px-2.5 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/30">
                        অনুমোদন
                      </button>
                      <button onClick={() => decide(req.id, false)}
                        className="rounded bg-red-500/20 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/30">
                        বাতিল
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {activeTab === "files" && files.length > 0 && (
              <>
                <div className="flex shrink-0 overflow-x-auto border-b bg-black/10" style={{ borderColor: "var(--border)" }}>
                  {files.map((f) => (
                    <button key={f.path} onClick={() => setActive(f.path)}
                      className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-[11px] ${f.path === active?.path ? "border-b-2 border-[var(--accent)] bg-white/[0.06] text-[var(--txt)]" : "text-[var(--txt-dim)] hover:bg-white/[0.04]"}`}>
                      <FileCode size={11} className="text-[var(--accent)]" />
                      {f.path.split(/[\\/]/).pop()}
                      {f.streaming && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" title="লিখছে…" />}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2 border-b bg-black/20 px-2 py-1" style={{ borderColor: "var(--border)" }}>
                  <span className="truncate text-[10.5px] font-mono text-[var(--txt-dim)]" title={active?.path}>{active?.path?.split(/[\\/]/).pop() || ""} · {langOf(active?.path || "")} · {(String(active?.content || "").split("\n").length)} lines</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <button onClick={doCopy} title="Copy" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] hover:bg-white/10">{copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}{copied ? "Copied" : "Copy"}</button>
                    <button onClick={doDownload} title="Download" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] hover:bg-white/10"><Download size={11} />Download</button>
                    <button onClick={doSave} title="Save to project" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] hover:bg-white/10" style={{ color: "var(--accent)" }}><Save size={11} />Save</button>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  {active && (isPptx(active.path) || isImage(active.path) || isAudio(active.path) || isVideo(active.path)) ? (
                    <MediaPreview path={active.path} />
                  ) : active ? (
                    <div className="relative h-full">
                      {active.streaming && (
                        <div className="pointer-events-none absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-400">
                          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-current" /> এজেন্ট লিখছে…
                        </div>
                      )}
                      <MonacoEditor
                        key={active.path}
                        height="100%"
                        language={langOf(active.path)}
                        theme="vs-dark"
                        value={active.content}
                        options={{
                          readOnly: true, fontSize: 12.5, minimap: { enabled: false },
                          automaticLayout: true, scrollBeyondLastLine: false, wordWrap: "on",
                          padding: { top: 8 }, renderLineHighlight: "none",
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {activeTab === "log" && (
              <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px]">
                {log.map((l, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}
                    className="flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-white/[0.04]">
                    <span className="shrink-0 text-[9.5px] text-[var(--txt-faint)]">{l.at}</span>
                    <span className="shrink-0">{l.icon}</span>
                    <span className="min-w-0 break-all" style={{ color: KIND_COLOR[l.kind] || "var(--txt-dim)" }}>{l.text}</span>
                  </motion.div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

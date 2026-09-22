"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, Brain, Code2, ShieldCheck, Search, FlaskConical, Crown,
  AlertTriangle, Check, Wrench, Sparkles, Copy, Pencil, MessageSquarePlus, Move,
} from "lucide-react";
import { useStore } from "@/lib/store";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import AgentAvatar from "./AgentAvatar";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);

const ROLE_META = {
  ceo: { icon: Crown, label: "CEO", color: "#f59e0b", glow: "245,158,11" },
  coder: { icon: Code2, label: "Coder", color: "#3b82f6", glow: "59,130,246" },
  reviewer: { icon: ShieldCheck, label: "Reviewer", color: "#22c55e", glow: "34,197,94" },
  researcher: { icon: Search, label: "Researcher", color: "#a855f7", glow: "168,85,247" },
  tester: { icon: FlaskConical, label: "Tester", color: "#f59e0b", glow: "245,158,11" },
};

// Color-code every line of the agent's live feed by its TYPE, so the popup
// reads like a professional console: thinking = amber, headings = accent,
// PC actions = cyan, results = green/red, lists = violet.
function lineClass(line) {
  const t = line.trim();
  if (!t) return { color: "var(--cb-muted)", italic: false };
  if (/^\*\*(Introduction|Approach|Plan|ETA|SELF-CHECK|ISSUE FOUND)/i.test(t)) return { color: "#f59e0b", bold: true };
  if (/^\[⚡ PC\]/.test(t)) return { color: "#22d3ee", bold: true };
  if (/^\[✓ OK\]/.test(t)) return { color: "#22c55e", bold: true };
  if (/^\[✗ FAIL\]/.test(t)) return { color: "#ef4444", bold: true };
  if (/^#{1,6}\s/.test(t)) return { color: "var(--cb-accent)", bold: true };
  if (/^\d+[.)]\s|^[-*]\s/.test(t)) return { color: "#c4b5fd" };
  return { color: "var(--cb-text)" };
}

// Guess language for highlight.js from a fence hint or heuristics.
function langOf(hint, code) {
  const h = (hint || "").toLowerCase();
  if (/jsx|tsx|react/.test(h)) return "javascript";
  if (/js|javascript|ts|typescript/.test(h)) return "javascript";
  if (/html|xml|svg/.test(h)) return "xml";
  if (/css|scss|style/.test(h)) return "css";
  if (/bash|sh|shell|cmd/.test(h)) return "bash";
  if (/json/.test(h)) return "json";
  if (/import |function |const |=>|<\/|style=/.test(code)) return "javascript";
  return "plaintext";
}

function StreamView({ text, role }) {
  const parts = useMemo(() => {
    const out = [];
    const re = /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)(?:```|$)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text || ""))) {
      if (m.index > last) out.push({ type: "text", body: text.slice(last, m.index) });
      out.push({ type: "code", lang: m[1], body: m[2], closed: text.slice(m.index).includes("```", m[0].length) });
      last = re.lastIndex;
    }
    if (last < (text || "").length) out.push({ type: "text", body: text.slice(last) });
    return out;
  }, [text]);

  const renderTextLines = (body) => {
    const lines = body.split("\n");
    return lines.map((line, j) => {
      const st = lineClass(line);
      return (
        <div
          key={j}
          style={{
            color: st.color,
            fontWeight: st.bold ? 700 : 400,
            fontStyle: st.italic ? "italic" : "normal",
            paddingLeft: /^\d+[.)]\s|^[-*]\s/.test(line.trim()) ? 8 : 0,
          }}
        >
          {line.trim() ? line : "\u00A0"}
        </div>
      );
    });
  };

  return (
    <div className="space-y-2">
      {parts.map((p, i) =>
        p.type === "code" ? (
          // New code blocks slide up + fade in like steps of a workflow.
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <CodeBlock code={p.body} langHint={p.lang} typing />
          </motion.div>
        ) : (
          p.body.trim() && (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[11px] leading-relaxed whitespace-pre-wrap cb-agent-note"
            >
              {renderTextLines(p.body)}
            </motion.div>
          )
        )
      )}
    </div>
  );
}

// One syntax-highlighted code block with a typing cursor + copy/edit actions.
function CodeBlock({ code, langHint, typing = false, danger = false, onEdit }) {
  const [copied, setCopied] = useState(false);
  const lang = langOf(langHint, code);
  const html = useMemo(() => {
    try {
      return lang !== "plaintext" && code.trim()
        ? hljs.highlight(code, { language: lang }).value
        : code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    } catch {
      // fail-closed: highlight.js throw হলেও raw code কখনো innerHTML-এ যাবে না
      return String(code).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
  }, [code, lang]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${danger ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.08)"}`,
        background: danger ? "rgba(239,68,68,0.06)" : "#0d1117",
        boxShadow: danger ? "0 0 14px rgba(239,68,68,0.25)" : undefined,
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider"
        style={{ background: "rgba(255,255,255,0.04)", color: danger ? "#ef4444" : "#8b949e" }}
      >
        {danger ? <AlertTriangle size={9} /> : <Code2 size={9} />}
        {lang}
        {danger && <span className="ml-1">issue found</span>}
        {/* Copy always visible — even while the agent is still typing. */}
        {!typing && (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              onClick={copy}
              className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] normal-case font-sans transition-colors"
              style={{ color: copied ? "#22c55e" : "#8b949e", background: "rgba(255,255,255,0.05)" }}
              title="Copy code"
              aria-label="Copy code"
            >
              {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? "Copied" : "Copy"}
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] normal-case font-sans transition-colors"
                style={{ color: "#8b949e", background: "rgba(255,255,255,0.05)" }}
                title="Edit this code"
                aria-label="Edit code"
              >
                <Pencil size={9} /> Edit
              </button>
            )}
          </span>
        )}
        {typing && (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              onClick={copy}
              className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] normal-case font-sans transition-colors"
              style={{ color: copied ? "#22c55e" : "#8b949e", background: "rgba(255,255,255,0.05)" }}
              title="Copy code (works while typing)"
              aria-label="Copy code"
            >
              {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? "Copied" : "Copy"}
            </button>
          </span>
        )}
      </div>
      <pre className="p-2.5 text-[10.5px] leading-relaxed overflow-x-auto font-mono" style={{ color: "#e6edf3" }}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
        {typing && <span className="cb-cursor" />}
      </pre>
    </div>
  );
}

// The floating agent window — appears while an agent is working, showing its
// live thinking and colorized code like a real developer's screen.
export default function AgentPopup({ sub, onClose, pinned, setPinned, onEditCode, onInsertChat }) {
  const meta = ROLE_META[sub.agentRole] || ROLE_META.coder;
  const Icon = meta.icon;
  const bodyRef = useRef(null);
  const pushToast = useStore((s) => s.pushToast);
  const [view, setView] = useState("live"); // live | code | fix
  const [editing, setEditing] = useState(false);
  const [editBuf, setEditBuf] = useState("");
  const startEdit = (code) => { setEditBuf(code || ""); setEditing(true); };

  const story = sub.story || null;
  const live = sub.status === "working";
  const done = sub.status === "done";
  const failed = sub.status === "failed";
  const hasFix = story && story.issue && story.fixedCode;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [sub.liveText]);

  // Auto-switch view on completion: show the fixed code if there was an issue.
  useEffect(() => {
    if (done && hasFix) setView("fix");
    else if (done) setView("code");
  }, [done]);

  const shownCode = view === "fix" ? story?.fixedCode : (story?.code || sub.liveText);

  // Render in a portal straight to <body> so motion layout/transform on any
  // ancestor card can never clip or shift this fixed-position popup.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ui = (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="fixed z-[70] w-[400px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden shadow-2xl"
      style={{
        right: 18,
        bottom: 120,
        background: "var(--cb-bg)",
        border: "1px solid var(--cb-border)",
        boxShadow: `0 0 0 1px rgba(${meta.glow},0.18), 0 24px 60px -12px rgba(0,0,0,0.55), 0 0 32px -6px rgba(${meta.glow},0.22)`,
      }}
    >
      {/* Header — draggable, agent identity */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing"
        style={{ background: `linear-gradient(120deg, rgba(${meta.glow},0.16), transparent 70%)` }}
      >
        <motion.span
          animate={live ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 1.6, repeat: live ? Infinity : 0 }}
          className="shrink-0"
        >
          <AgentAvatar role={sub.agentRole} name={sub.agentName} size={32} working={live} />
        </motion.span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: "var(--cb-text)" }}>{sub.agentName || meta.label}</span>
            <span className="text-[9px] px-1.5 py-px rounded-full font-medium" style={{ background: `rgba(${meta.glow},0.14)`, color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <div className="text-[10px] truncate cb-agent-status" style={{ color: "var(--cb-muted)" }}>
            {sub.title}
          </div>
        </div>
        {live && <Loader2 size={13} className="animate-spin shrink-0" style={{ color: meta.color }} />}
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.16)" }}>
            <Check size={10} style={{ color: "#22c55e" }} />
          </motion.span>
        )}
        {failed && <AlertTriangle size={13} className="shrink-0" style={{ color: "#ef4444" }} />}
        <button onClick={() => setPinned(!pinned)} className="cb-focus p-1 rounded shrink-0" title={pinned ? "Unpin" : "Pin"} aria-label="Pin popup"
          style={{ color: pinned ? meta.color : "var(--cb-muted)" }}>
          <Sparkles size={12} />
        </button>
        <button onClick={onClose} className="cb-focus p-1 rounded shrink-0" style={{ color: "var(--cb-muted)" }} aria-label="Close">
          <X size={13} />
        </button>
      </div>

      {/* View tabs (after done): live notes / final code / fix */}
      {done && (story?.code || hasFix) && (
        <div className="flex items-center gap-1 px-3 pb-1.5">
          {[
            { k: "code", label: "Code" },
            ...(hasFix ? [{ k: "fix", label: "Fixed code", color: "#22c55e" }] : []),
            { k: "live", label: "Notes" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              className="cb-focus px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
              style={{
                background: view === t.k ? `rgba(${meta.glow},0.15)` : "transparent",
                color: view === t.k ? (t.color || meta.color) : "var(--cb-muted)",
                border: `1px solid ${view === t.k ? `rgba(${meta.glow},0.3)` : "var(--cb-border)"}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div ref={bodyRef} className="px-3 pb-3 pt-1 max-h-[300px] overflow-y-auto">
        {/* Agent's self-introduction — shown first, like a real developer
            introducing themselves before starting work. */}
        {(live || done) && story?.intro && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 rounded-lg p-2 flex items-start gap-1.5"
            style={{ background: `rgba(${meta.glow},0.08)`, border: `1px solid rgba(${meta.glow},0.2)` }}
          >
            <Brain size={11} className="shrink-0 mt-0.5" style={{ color: meta.color }} />
            <span className="text-[10.5px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--cb-text)" }}>
              {story.intro}
            </span>
          </motion.div>
        )}

        {editing ? (
          <div className="space-y-2">
            {/* Editor header — exactly WHOSE code and WHAT is being edited */}
            <div
              className="rounded-lg p-2 flex items-center gap-1.5 text-[10.5px]"
              style={{ background: `rgba(${meta.glow},0.10)`, border: `1px solid rgba(${meta.glow},0.3)` }}
            >
              <Pencil size={11} style={{ color: meta.color }} className="shrink-0" />
              <span style={{ color: "var(--cb-text)" }}>
                Editing <strong style={{ color: meta.color }}>{sub.agentName || meta.label}</strong>&apos;s code —{" "}
                <span style={{ color: "var(--cb-muted)" }}>{sub.title}</span>
              </span>
            </div>
            <textarea
              value={editBuf}
              onChange={(e) => setEditBuf(e.target.value)}
              className="cb-focus w-full h-40 p-2.5 rounded-lg text-[10.5px] font-mono leading-relaxed outline-none resize-none"
              style={{ background: "#0d1117", color: "#e6edf3", border: `1px solid rgba(${meta.glow},0.4)` }}
              spellCheck={false}
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { onEditCode?.(sub.id, editBuf); setEditing(false); }}
                className="cb-focus px-2.5 py-1 rounded-md text-[10px] font-medium"
                style={{ background: meta.color, color: "white" }}
              >
                Save
              </button>
              <button
                onClick={() => { onInsertChat?.(editBuf); setEditing(false); }}
                className="cb-focus px-2.5 py-1 rounded-md text-[10px] font-medium inline-flex items-center gap-1"
                style={{ background: `rgba(${meta.glow},0.14)`, color: meta.color, border: `1px solid rgba(${meta.glow},0.3)` }}
              >
                <MessageSquarePlus size={10} /> Insert into chat
              </button>
              <button
                onClick={() => setEditing(false)}
                className="cb-focus px-2.5 py-1 rounded-md text-[10px]"
                style={{ color: "var(--cb-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : failed ? (
          <div className="text-xs flex items-start gap-1.5 py-2" style={{ color: "#ef4444" }}>
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span className="break-words">{sub.output || "This agent failed."}</span>
          </div>
        ) : view === "live" && live ? (
          <StreamView text={sub.liveText || ""} />
        ) : view === "fix" ? (
          <div className="space-y-2">
            {story?.issue && (
              <div className="flex items-start gap-1.5 text-[10.5px] rounded-lg p-2" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{story.issue}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#22c55e" }}>
              <Wrench size={11} /> {sub.agentName || "Agent"} found and fixed this issue — corrected code:
            </div>
            <CodeBlock code={story?.fixedCode || ""} typing={false} onEdit={onEditCode ? () => startEdit(story?.fixedCode || "") : undefined} />
          </div>
        ) : view === "code" && story?.code ? (
          <CodeBlock code={story.code} typing={false} onEdit={onEditCode ? () => startEdit(story.code) : undefined} />
        ) : view === "code" && !story?.code && sub.liveText ? (
          <StreamView text={sub.liveText} />
        ) : done && story?.notes ? (
          <div className="text-[11px] leading-relaxed whitespace-pre-wrap cb-agent-note">{story.notes}</div>
        ) : live ? (
          <StreamView text={sub.liveText || ""} />
        ) : (
          <div className="cb-skel py-1"><div /><div /><div /></div>
        )}
      </div>

      {/* Footer action bar — Copy / Edit / Insert + drag hint, always visible */}
      <div
        className="flex items-center gap-1 px-2.5 py-1.5 border-t"
        style={{ borderColor: "var(--cb-border)", background: "rgba(0,0,0,0.14)" }}
      >
        <button
          onClick={async () => {
            const all = [story?.code, story?.fixedCode, story?.notes].filter(Boolean).join("\n\n") || sub.output || "";
            try { await navigator.clipboard.writeText(all); } catch {}
            pushToast({ type: "success", message: "কোড copy হয়েছে / Code copied." });
          }}
          className="cb-focus px-2 py-1 rounded-md text-[10px] font-medium inline-flex items-center gap-1"
          style={{ background: `rgba(${meta.glow},0.14)`, color: meta.color }}
          title="Copy all output"
        >
          <Copy size={10} /> Copy all
        </button>
        {onEditCode && !editing && (
          <button
            onClick={() => startEdit(story?.code || story?.fixedCode || sub.output || "")}
            className="cb-focus px-2 py-1 rounded-md text-[10px] font-medium inline-flex items-center gap-1"
            style={{ background: "var(--cb-surface)", color: "var(--cb-text)", border: "1px solid var(--cb-border)" }}
            title="Edit this agent's code"
          >
            <Pencil size={10} /> Edit
          </button>
        )}
        {onInsertChat && (
          <button
            onClick={() => onInsertChat(story?.fixedCode || story?.code || sub.output || "")}
            className="cb-focus px-2 py-1 rounded-md text-[10px] font-medium inline-flex items-center gap-1"
            style={{ background: "var(--cb-accent)", color: "white" }}
            title="Insert into chat input"
          >
            <MessageSquarePlus size={10} /> Paste to chat
          </button>
        )}
        <span className="ml-auto text-[9px] flex items-center gap-1" style={{ color: "var(--cb-muted)" }}>
          <Move size={9} /> drag to move
        </span>
      </div>

      {/* Footer glow line */}
      <motion.div
        className="h-0.5"
        animate={live ? { opacity: [0.4, 1, 0.4] } : { opacity: 0.9 }}
        transition={{ duration: 1.4, repeat: live ? Infinity : 0 }}
        style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
      />
    </motion.div>
  );
  return mounted && typeof document !== "undefined" ? createPortal(ui, document.body) : null;
}

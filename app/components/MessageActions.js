"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, RotateCcw, Edit2, ThumbsUp, ThumbsDown, MoreHorizontal, ClipboardCopy, Code2 } from "lucide-react";
import { useStore } from "@/lib/store";

export default function MessageActions({ message, onRegenerate, onEdit, onFeedback }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [feedback, setFeedback] = useState(message.feedback || null);
  const ref = useRef(null);
  const pushClip = useStore((s) => s.pushClip);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const copy = async (text, which) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    // Every copy is also remembered in the clip cabinet so Ctrl+V in the
    // chat input can paste everything that was copied.
    pushClip(text);
    if (which === "md") { setCopiedMd(true); setTimeout(() => setCopiedMd(false), 1500); }
    else if (which === "code") { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500); }
    else { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  const isUser = message.role === "user";

  return (
    <div ref={ref} className="relative inline-flex items-center gap-0.5">
      <button
        onClick={() => copy(message.content || "", "plain")}
        className="cb-focus p-1 rounded text-xs flex items-center gap-1 hover:bg-cb-border transition-colors"
        style={{ color: "var(--cb-muted)" }}
        title="Copy"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>

      {isUser && onEdit && (
        <button
          onClick={onEdit}
          className="cb-focus p-1 rounded text-xs hover:bg-cb-border transition-colors"
          style={{ color: "var(--cb-muted)" }}
          title="Edit & resend"
          aria-label="Edit message"
        >
          <Edit2 size={12} />
        </button>
      )}

      {!isUser && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="cb-focus p-1 rounded text-xs hover:bg-cb-border transition-colors"
          style={{ color: "var(--cb-muted)" }}
          title="Regenerate"
          aria-label="Regenerate response"
        >
          <RotateCcw size={12} />
        </button>
      )}

      {!isUser && (
        <>
          <button
            onClick={() => { const v = feedback === "up" ? null : "up"; setFeedback(v); onFeedback?.(v); }}
            className="cb-focus p-1 rounded text-xs hover:bg-cb-border transition-colors"
            style={{ color: feedback === "up" ? "var(--cb-accent)" : "var(--cb-muted)" }}
            title="Helpful"
            aria-label="Mark helpful"
            aria-pressed={feedback === "up"}
          >
            <ThumbsUp size={12} />
          </button>
          <button
            onClick={() => { const v = feedback === "down" ? null : "down"; setFeedback(v); onFeedback?.(v); }}
            className="cb-focus p-1 rounded text-xs hover:bg-cb-border transition-colors"
            style={{ color: feedback === "down" ? "var(--cb-accent)" : "var(--cb-muted)" }}
            title="Not helpful"
            aria-label="Mark not helpful"
            aria-pressed={feedback === "down"}
          >
            <ThumbsDown size={12} />
          </button>
        </>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="cb-focus p-1 rounded text-xs hover:bg-cb-border transition-colors"
        style={{ color: "var(--cb-muted)" }}
        title="More"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={12} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl py-1 z-30"
            style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
          >
            <MenuItem icon={ClipboardCopy} label="Copy as Markdown" onClick={() => copy(message.content || "", "md")} />
            <MenuItem icon={Code2} label="Copy code blocks" onClick={() => copy(extractCode(message.content || ""), "code")} />
            {isUser && onEdit && <MenuItem icon={Edit2} label="Edit & resend" onClick={onEdit} />}
            {!isUser && onRegenerate && <MenuItem icon={RotateCcw} label="Regenerate response" onClick={onRegenerate} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="cb-focus w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-cb-surface transition-colors"
    >
      <Icon size={12} style={{ color: "var(--cb-muted)" }} />
      {label}
    </button>
  );
}

function extractCode(text) {
  const blocks = [];
  const re = /```[\w-]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) blocks.push(m[1]);
  return blocks.join("\n\n");
}

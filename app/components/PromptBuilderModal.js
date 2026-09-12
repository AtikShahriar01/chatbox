"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  X, Wand2, Loader2, Copy, Check, RefreshCw, PlusCircle, Sparkles,
  MessageSquarePlus, ListPlus, Info, AlertCircle, Pencil,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { callModel } from "@/lib/agents";

// Prompt-engineering rules distilled from OpenAI/Anthropic/Google's official
// guides: role, context, task, constraints, output format, examples, and
// step-by-step structure. Sent as the system prompt so ANY model can produce
// a top-class result using its own selected provider.
const BUILDER_PROMPT = `You are a world-class prompt engineer. Your job: turn the user's raw request into ONE professional, production-grade prompt that can be given to an AI assistant.

Rules:
- Include EVERYTHING the user asked for — nothing may be dropped, nothing added that contradicts their wish.
- Structure the prompt with these sections (in the user's language, with these exact headings):
  # Role — who the AI must act as
  # Objective — the single clear goal
  # Context — all background the user gave
  # Requirements — numbered, complete, verifiable (include every detail the user mentioned)
  # Constraints — quality bar, style, language, what to avoid
  # Output Format — exactly how the answer must be structured
  # Verification — how the AI must self-check before answering (no errors, no placeholders)
  # Steps — the internal step-by-step process the AI must follow
- The prompt must demand error-free, step-by-step, professional work.
- Write the prompt in the SAME language the user wrote their request in.

After the prompt, reply with a separator line "===EXPLAIN===" then:
- "what_it_does": 3-5 bullets — what will happen when this prompt is used
- "can_add": 3-6 bullets — further options the user could add
- All in the user's language.`;

export default function PromptBuilderModal({ open, onClose }) {
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const apiKey = useStore((s) => s.apiKey);
  const apiModel = useStore((s) => s.apiModel);
  const pushToast = useStore((s) => s.pushToast);
  const setChatInputDraft = useStore((s) => s.setChatInputDraft);

  const [want, setWant] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { prompt, whatItDoes, canAdd, raw }
  const [adding, setAdding] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBuf, setEditBuf] = useState("");

  useEffect(() => {
    if (open) { setWant(""); setResult(null); setEditing(false); setAdding(""); }
  }, [open]);

  if (!open) return null;

  const build = async () => {
    if (!want.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const { content } = await callModel({
        apiBaseUrl, apiKey, apiModel,
        messages: [
          { role: "system", content: BUILDER_PROMPT },
          { role: "user", content: want.trim().slice(0, 8000) },
        ],
        temperature: 0.4,
        maxTokens: 3000,
      });
      const parts = content.split(/===EXPLAIN===/i);
      const prompt = (parts[0] || "").trim();
      let whatItDoes = [], canAdd = [];
      const explain = parts[1] || "";
      for (const line of explain.split("\n")) {
        const t = line.replace(/^\s*[-*]\s*|^\s*\d+[.)]\s*/, "").trim();
        if (!t) continue;
        if (/^what_it_does/i.test(t)) continue;
        if (/^can_add/i.test(t)) continue;
        if (whatItDoes.length < 5 && /what|কী হবে|কি হবে/i.test(explain) && canAdd.length === 0) whatItDoes.push(t);
        else canAdd.push(t);
      }
      // Fallback: split explain bullets evenly if the tags were missing.
      if (whatItDoes.length === 0 && canAdd.length === 0) {
        const bullets = explain.split("\n").map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).filter(Boolean);
        whatItDoes = bullets.slice(0, Math.ceil(bullets.length / 2));
        canAdd = bullets.slice(Math.ceil(bullets.length / 2));
      }
      setResult({ prompt, whatItDoes, canAdd });
    } catch (e) {
      pushToast({ type: "error", message: "Prompt build failed: " + String(e?.message || e).slice(0, 160) });
    } finally {
      setBusy(false);
    }
  };

  // Refine: add extra requirements to the previous build.
  const refine = async (extra) => {
    if (!extra.trim() || !result || busy) return;
    setBusy(true);
    try {
      const { content } = await callModel({
        apiBaseUrl, apiKey, apiModel,
        messages: [
          { role: "system", content: BUILDER_PROMPT },
          { role: "user", content: `Original request:\n${want}\n\nAdditionally add these requirements:\n${extra}` },
        ],
        temperature: 0.4,
        maxTokens: 3000,
      });
      const parts = content.split(/===EXPLAIN===/i);
      setResult((r) => ({ ...r, prompt: (parts[0] || "").trim() }));
      setWant((w) => w + "\n\nAdditional: " + extra.trim());
      setAdding("");
      pushToast({ type: "success", message: "Prompt updated." });
    } catch (e) {
      pushToast({ type: "error", message: "Refine failed: " + String(e?.message || e).slice(0, 140) });
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.prompt); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--cb-border)" }}>
              <div>
                <h3 className="text-base font-semibold tracking-tight flex items-center gap-1.5">
                  <Wand2 size={16} style={{ color: "var(--cb-accent)" }} /> Prompt Builder
                </h3>
                <p className="text-xs" style={{ color: "var(--cb-muted)" }}>
                  আপনার চাওয়া লিখুন — আপনার সেট করা মডেল ({apiModel}) একটি professional, world-class prompt বানিয়ে দেবে।
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-cb-surface" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Input */}
              <div>
                <label className="text-xs font-medium block mb-1.5">আপনি কী চান? / What do you want?</label>
                <textarea
                  value={want}
                  onChange={(e) => setWant(e.target.value)}
                  placeholder="যেমন: আমার ই-কমার্স সাইটের জন্য একটা product description লেখক AI চাই, বাংলায় লিখবে, SEO-friendly হবে..."
                  rows={3}
                  className="cb-focus w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: "var(--cb-muted)" }}>
                    সবকিছু অন্তর্ভুক্ত হবে — কোনো error ছাড়া, step-by-step, professional মানে
                  </span>
                  <button
                    onClick={build}
                    disabled={busy || !want.trim()}
                    className="cb-focus px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: "var(--cb-accent)", color: "white" }}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {busy ? "Building..." : "Build prompt"}
                  </button>
                </div>
              </div>

              {/* Result */}
              {result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  {/* The prompt itself */}
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--cb-border)" }}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium"
                      style={{ background: "var(--cb-surface)", color: "var(--cb-muted)" }}>
                      <Sparkles size={10} style={{ color: "var(--cb-accent)" }} /> PROFESSIONAL PROMPT
                      <span className="ml-auto flex items-center gap-1">
                        <button onClick={copyPrompt} className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]"
                          style={{ color: copied ? "#22c55e" : "var(--cb-muted)", background: "var(--cb-bg)" }}>
                          {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? "Copied" : "Copy"}
                        </button>
                        <button onClick={() => { setEditBuf(result.prompt); setEditing(!editing); }}
                          className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]"
                          style={{ color: "var(--cb-muted)", background: "var(--cb-bg)" }}>
                          <Pencil size={9} /> Edit
                        </button>
                        <button
                          onClick={() => { setChatInputDraft(result.prompt); onClose(); pushToast({ type: "success", message: "Prompt inserted into chat input." }); }}
                          className="cb-focus inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{ color: "var(--cb-accent)", background: "var(--cb-bg)" }}>
                          <MessageSquarePlus size={9} /> Use in chat
                        </button>
                      </span>
                    </div>
                    {editing ? (
                      <div className="p-2">
                        <textarea
                          value={editBuf}
                          onChange={(e) => setEditBuf(e.target.value)}
                          className="cb-focus w-full h-56 p-2 rounded text-xs font-mono outline-none resize-none"
                          style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-accent)", color: "var(--cb-text)" }}
                          spellCheck={false}
                        />
                        <button
                          onClick={() => { setResult({ ...result, prompt: editBuf }); setEditing(false); }}
                          className="mt-1.5 px-3 py-1 rounded text-[10px] font-medium"
                          style={{ background: "var(--cb-accent)", color: "white" }}
                        >
                          Save changes
                        </button>
                      </div>
                    ) : (
                      <pre className="px-3 py-2.5 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ color: "var(--cb-text)" }}>
                        {result.prompt}
                      </pre>
                    )}
                  </div>

                  {/* What it does */}
                  {result.whatItDoes.length > 0 && (
                    <div className="rounded-lg p-3" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
                      <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--cb-accent)" }}>
                        <Info size={11} /> এই prompt দিয়ে কী কী হবে
                      </div>
                      <ul className="space-y-1">
                        {result.whatItDoes.map((t, i) => (
                          <li key={i} className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: "var(--cb-text)" }}>
                            <span style={{ color: "var(--cb-accent)" }}>›</span> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Can add + refine */}
                  <div className="rounded-lg p-3" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
                    <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "#f59e0b" }}>
                      <ListPlus size={11} /> আর কী কী যোগ করা যায়? (যোগ করতে ক্লিক করুন)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.canAdd.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => refine(t)}
                          disabled={busy}
                          className="cb-focus text-left text-[10.5px] px-2 py-1 rounded-md inline-flex items-center gap-1 disabled:opacity-50 hover:brightness-110 transition-all"
                          style={{ background: "color-mix(in srgb, #f59e0b 10%, transparent)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--cb-text)" }}
                        >
                          <PlusCircle size={9} style={{ color: "#f59e0b" }} /> {t}
                        </button>
                      ))}
                    </div>
                    {/* Custom refine */}
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <input
                        value={adding}
                        onChange={(e) => setAdding(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") refine(adding); }}
                        placeholder="নিজে কিছু যোগ করুন…"
                        className="cb-focus flex-1 px-2.5 py-1.5 rounded-md text-[11px] outline-none"
                        style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
                      />
                      <button
                        onClick={() => refine(adding)}
                        disabled={busy || !adding.trim()}
                        className="cb-focus px-2.5 py-1.5 rounded-md text-[10px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        style={{ background: "var(--cb-accent)", color: "white" }}
                      >
                        {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Add & rebuild
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {busy && !result && (
                <div className="cb-skel py-2"><div /><div /><div /></div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, Plus, Trash2, Edit2 } from "lucide-react";
import { useStore } from "@/lib/store";

export default function CopilotEditor({ open, onClose }) {
  const copilots = useStore((s) => s.copilots);
  const activeCopilotId = useStore((s) => s.activeCopilotId);
  const addCopilot = useStore((s) => s.addCopilot);
  const updateCopilot = useStore((s) => s.updateCopilot);
  const removeCopilot = useStore((s) => s.removeCopilot);
  const [editing, setEditing] = useState(null);

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
            className="w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--cb-border)" }}>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Copilots</h3>
                <p className="text-xs" style={{ color: "var(--cb-muted)" }}>Reusable personas — switch per chat.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing("new")}
                  className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                  style={{ background: "var(--cb-accent)", color: "white" }}
                >
                  <Plus size={12} /> New
                </button>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-cb-surface" aria-label="Close"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--cb-border)" }}>
                {copilots.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 px-3 py-2.5 transition-colors"
                    style={{
                      background: c.id === activeCopilotId ? "color-mix(in srgb, var(--cb-accent) 10%, transparent)" : "transparent",
                      borderBottom: "1px solid var(--cb-border)",
                    }}
                  >
                    <span className="text-2xl mt-0.5">{c.icon || "🤖"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs truncate" style={{ color: "var(--cb-muted)" }}>{c.systemPrompt.slice(0, 80)}{c.systemPrompt.length > 80 ? "…" : ""}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: "var(--cb-muted)" }}>
                        <span>temp {c.temperature?.toFixed(1)}</span>
                        {c.builtin && <span>· built-in</span>}
                        {c.id === activeCopilotId && <span style={{ color: "var(--cb-accent)" }}>· active</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!c.builtin && (
                        <>
                          <button onClick={() => setEditing(c)} className="p-1.5 rounded hover:bg-cb-border" aria-label="Edit"><Edit2 size={12} /></button>
                          <button onClick={() => removeCopilot(c.id)} className="p-1.5 rounded hover:bg-cb-border text-red-400" aria-label="Delete"><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 border-t flex items-center justify-end" style={{ borderColor: "var(--cb-border)" }}>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "var(--cb-accent)" }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {editing && (
        <CopilotForm
          key={editing.id || "new"}
          copilot={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            if (editing === "new") addCopilot(c);
            else updateCopilot(editing.id, c);
            setEditing(null);
          }}
        />
      )}
    </AnimatePresence>
  );
}

function CopilotForm({ copilot, onClose, onSave }) {
  const [form, setForm] = useState(copilot || { name: "", icon: "🤖", systemPrompt: "", temperature: 0.7 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ok = form.name && form.systemPrompt;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
        className="w-full max-w-md rounded-2xl shadow-2xl p-5"
        style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold tracking-tight">{copilot ? "Edit copilot" : "New copilot"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-cb-surface" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <div>
              <label className="text-xs font-medium block mb-1">Icon</label>
              <input value={form.icon} onChange={(e) => set("icon", e.target.value)} maxLength={2} className="cb-focus w-full px-3 py-2 rounded text-sm text-center" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Code Reviewer" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">System prompt</label>
            <textarea value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} rows={4} placeholder="You are a…" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Temperature ({(form.temperature ?? 0.7).toFixed(1)})</label>
            <input type="range" min="0" max="2" step="0.1" value={form.temperature ?? 0.7} onChange={(e) => set("temperature", parseFloat(e.target.value))} className="w-full" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm" style={{ color: "var(--cb-muted)" }}>Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={!ok}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--cb-accent)" }}
          >
            <Check size={14} /> {copilot ? "Save" : "Create"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const inputStyle = { background: "var(--cb-surface)", border: "1px solid var(--cb-border)" };

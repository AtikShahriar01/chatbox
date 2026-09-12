"use client";

import { motion } from "motion/react";
import { Sparkles, Plus } from "lucide-react";
import { PROMPT_SUGGESTIONS } from "@/lib/store";

export default function EmptyState({ onPick, onNew }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-2xl my-auto">
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase mb-4"
            style={{ background: "var(--cb-surface)", color: "var(--cb-muted)", border: "1px solid var(--cb-border)" }}>
            <Sparkles size={11} /> Local-first · BYOK · Multi-model
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2">What can I help you with today?</h1>
          <p className="text-sm" style={{ color: "var(--cb-muted)" }}>
            Pick a starter, or just type your own message below.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
          {PROMPT_SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(s)}
              className="cb-focus text-left p-3 rounded-xl border transition-colors"
              style={{ background: "var(--cb-surface)", borderColor: "var(--cb-border)" }}
            >
              <div className="text-lg mb-1">{s.icon}</div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--cb-muted)" }}>{s.prompt}</div>
            </motion.button>
          ))}
        </div>

        {onNew && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-center"
          >
            <button
              onClick={onNew}
              className="text-xs underline-offset-4 hover:underline"
              style={{ color: "var(--cb-muted)" }}
            >
              <Plus size={12} className="inline mr-0.5" /> Or start a blank chat
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

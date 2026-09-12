"use client";

import { motion } from "motion/react";
import { Square } from "lucide-react";

export default function StopButton({ onClick, label = "Stop generating" }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-colors"
      style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
      title={label}
      aria-label={label}
    >
      <Square size={12} fill="currentColor" style={{ color: "var(--cb-text)" }} />
    </motion.button>
  );
}

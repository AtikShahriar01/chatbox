"use client";

import { useStore } from "@/lib/store";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};
const COLOR = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#3b82f6",
  warning: "#f59e0b",
};

export default function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-xl shadow-2xl"
              style={{
                background: "var(--cb-surface)",
                border: "1px solid var(--cb-border)",
                minWidth: 240,
              }}
            >
              <Icon size={16} style={{ color: COLOR[t.type] || COLOR.info, marginTop: 2 }} />
              <div className="flex-1 text-sm leading-snug">{t.message}</div>
              <button
                onClick={() => dismiss(t.id)}
                className="p-0.5 rounded hover:bg-cb-border transition-colors"
                style={{ color: "var(--cb-muted)" }}
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

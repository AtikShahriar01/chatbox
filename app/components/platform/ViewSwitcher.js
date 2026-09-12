"use client";

// ViewSwitcher — the one-tap way to move between Chat / IDE / Console.
// Client-side state switch (no reload); premium segmented control.

import { motion } from "motion/react";
import { MessageSquareText, Code2, LayoutDashboard } from "lucide-react";
import { useUi } from "@/lib/ui-store";

const VIEWS = [
  { k: "chat", label: "Chat", icon: MessageSquareText },
  { k: "ide", label: "IDE", icon: Code2 },
  { k: "console", label: "Console", icon: LayoutDashboard },
];

export default function ViewSwitcher({ compact = false }) {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl p-0.5"
      style={{ background: "color-mix(in srgb, var(--cb-surface) 85%, transparent)", border: "1px solid var(--cb-border)" }}
      role="tablist"
      aria-label="Workspace view"
    >
      {VIEWS.map((v) => {
        const active = view === v.k;
        return (
          <button
            key={v.k}
            role="tab"
            aria-selected={active}
            aria-label={v.label}
            title={v.label}
            onClick={() => setView(v.k)}
            className={`relative flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 ${compact ? "py-1" : "py-1.5"} text-[11.5px] font-semibold ide-transition`}
            style={active ? { color: "#fff" } : { color: "var(--cb-muted)" }}
          >
            {active && (
              <motion.span
                layoutId="view-switcher-pill"
                transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
                className="absolute inset-0 rounded-[10px]"
                style={{ background: "var(--cb-accent)", boxShadow: "0 2px 10px color-mix(in srgb, var(--cb-accent) 45%, transparent)" }}
              />
            )}
            <v.icon size={13} className="relative z-10" />
            {!compact && <span className="relative z-10">{v.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

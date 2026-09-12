"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, Plus, Settings as SettingsIcon, MessageSquare, Trash2, Sun, Moon, Monitor, Sparkles, ArrowRight, Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import Fuse from "fuse.js";

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const chats = useStore((s) => s.chats);
  const setActive = useStore((s) => s.setActive);
  const deleteChat = useStore((s) => s.deleteChat);
  const createChat = useStore((s) => s.createChat);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setSetting = useStore((s) => s.setSetting);
  const mode = useStore((s) => s.mode);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const fuse = useMemo(() => new Fuse(chats, {
    keys: ["title", "messages.content"],
    threshold: 0.4,
    includeScore: true,
  }), [chats]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return [
        ...chats.slice(0, 5).map((c) => ({ type: "chat", chat: c })),
      ];
    }
    const matches = fuse.search(query).slice(0, 10);
    return matches.map((m) => ({ type: "chat", chat: m.item }));
  }, [query, chats, fuse]);

  const actions = useMemo(() => {
    const setPromptBuilderOpen = useStore.getState().setPromptBuilderOpen;
    const baseActions = [
      { id: "new", label: "New chat", icon: Plus, run: () => { createChat(); setOpen(false); } },
      { id: "promptbuilder", label: "Prompt Builder — AI prompt বানান", icon: Wand2, run: () => { setPromptBuilderOpen(true); setOpen(false); } },
      { id: "settings", label: "Open Settings", icon: SettingsIcon, run: () => { setSettingsOpen(true); setOpen(false); } },
      { id: "theme-light", label: "Theme: Light", icon: Sun, run: () => { setSetting("mode", "light"); setOpen(false); } },
      { id: "theme-dark", label: "Theme: Dark", icon: Moon, run: () => { setSetting("mode", "dark"); setOpen(false); } },
      { id: "theme-system", label: "Theme: System", icon: Monitor, run: () => { setSetting("mode", "system"); setOpen(false); } },
    ];
    if (!query.trim()) return baseActions.slice(0, 2);
    return baseActions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())).slice(0, 4);
  }, [query, createChat, setSettingsOpen, setSetting, setOpen]);

  const all = [...actions, ...results];

  useEffect(() => { setActiveIdx(0); }, [query]);

  const onKey = (e) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, all.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = all[activeIdx];
      if (r?.type === "chat") { setActive(r.chat.id); setOpen(false); }
      else if (r?.run) r.run();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-start justify-center p-4 pt-[12vh]"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: -10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: "var(--cb-border)" }}>
              <Search size={16} style={{ color: "var(--cb-muted)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search chats, run commands…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-muted)" }}>esc</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-1.5">
              {all.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm" style={{ color: "var(--cb-muted)" }}>
                  <Sparkles size={18} className="mx-auto mb-2 opacity-50" />
                  No results.
                </div>
              ) : (
                <>
                  {actions.length > 0 && (
                    <SectionLabel>Actions</SectionLabel>
                  )}
                  {actions.map((a, i) => {
                    const idx = i;
                    return (
                      <Item
                        key={a.id}
                        active={activeIdx === idx}
                        icon={a.icon}
                        title={a.label}
                        onClick={() => a.run()}
                        onMouseEnter={() => setActiveIdx(idx)}
                      />
                    );
                  })}
                  {results.length > 0 && (
                    <SectionLabel>{query ? "Chats matching" : "Recent chats"}</SectionLabel>
                  )}
                  {results.map((r, i) => {
                    const idx = actions.length + i;
                    const lastMsg = Array.isArray(r.chat.messages) ? r.chat.messages[r.chat.messages.length - 1] : null;
                    return (
                      <Item
                        key={r.chat.id}
                        active={activeIdx === idx}
                        icon={MessageSquare}
                        title={r.chat.title}
                        subtitle={lastMsg ? lastMsg.content.slice(0, 80) : "No messages yet"}
                        onClick={() => { setActive(r.chat.id); setOpen(false); }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        actions={(
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteChat(r.chat.id); }}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-cb-border text-red-400 transition-opacity"
                            aria-label="Delete chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      />
                    );
                  })}
                </>
              )}
            </div>
            <div className="px-3 py-2 border-t flex items-center gap-3 text-[10px]" style={{ borderColor: "var(--cb-border)", color: "var(--cb-muted)" }}>
              <span><kbd className="px-1 rounded" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>↑↓</kbd> navigate</span>
              <span><kbd className="px-1 rounded" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>↵</kbd> open</span>
              <span><kbd className="px-1 rounded" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>esc</kbd> close</span>
              <span className="ml-auto">Powered by your chats</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionLabel({ children }) {
  return <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--cb-muted)" }}>{children}</div>;
}

function Item({ active, icon: Icon, title, subtitle, onClick, onMouseEnter, actions }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors"
      style={{ background: active ? "var(--cb-surface)" : "transparent" }}
    >
      <Icon size={14} style={{ color: active ? "var(--cb-accent)" : "var(--cb-muted)" }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && <div className="text-[11px] truncate" style={{ color: "var(--cb-muted)" }}>{subtitle}</div>}
      </div>
      {actions}
      <ArrowRight size={12} className={`transition-opacity ${active ? "opacity-100" : "opacity-0"}`} style={{ color: "var(--cb-muted)" }} />
    </div>
  );
}

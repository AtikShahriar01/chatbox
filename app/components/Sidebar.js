"use client";

import { useStore, detectProvider, PROVIDER_LABELS } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { Plus, Image as ImageIcon, Search, Pin, Trash2, MessageSquare, Bot, Settings as SettingsIcon, HelpCircle, Info, PanelLeftClose, PanelLeftOpen, X, Sparkles, Github, FileText, Command, BookOpen, Activity, Code2, LayoutDashboard } from "lucide-react";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { formatCost, formatBDT, formatUSDT, formatValueBDT } from "@/lib/pricing";
import { formatTokenCount } from "@/lib/tokenizer";

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const chats = useStore((s) => s.chats);
  const activeChatId = useStore((s) => s.activeChatId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const setActive = useStore((s) => s.setActive);
  const createChat = useStore((s) => s.createChat);
  const createImageChat = useStore((s) => s.createImageChat);
  const deleteChat = useStore((s) => s.deleteChat);
  const togglePin = useStore((s) => s.togglePin);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setSidebar = useStore((s) => s.setSidebar);
  const todayUsage = useStore((s) => s.todayUsage);
  const monthlyUsage = useStore((s) => s.monthlyUsage);
  const fxRate = useStore((s) => s.fxRateBDT);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const [query, setQuery] = useState("");

  const provider = detectProvider(apiBaseUrl);

  const todayTokenCount = useMemo(() => {
    // Approximate: today's share of the month's tokens, proportional to requests
    const monthReqs = monthlyUsage?.requests || 0;
    const todayReqs = todayUsage?.requests || 0;
    if (!monthReqs || !todayReqs) return 0;
    const share = todayReqs / monthReqs;
    const total = (monthlyUsage?.promptTokens || 0) + (monthlyUsage?.completionTokens || 0);
    return Math.round(total * share);
  }, [monthlyUsage, todayUsage]);

  const { pinned, regular } = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = chats
      .filter((c) => {
        if (!q) return true;
        if (c.title.toLowerCase().includes(q)) return true;
        // also search inside messages
        return c.messages?.some((m) => m.content?.toLowerCase().includes(q));
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    return {
      pinned: filtered.filter((c) => c.pinned),
      regular: filtered.filter((c) => !c.pinned),
    };
  }, [chats, query]);

  const isMobile = mobileOpen !== undefined;
  const width = sidebarOpen ? 288 : 52;

  const content = (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="relative shrink-0 h-full border-r overflow-hidden backdrop-blur-xl"
      style={{
        background: "color-mix(in srgb, var(--cb-sidebar) 80%, transparent)",
        borderColor: "var(--cb-border)",
      }}
    >
      {!sidebarOpen && !isMobile ? (
        <div className="flex flex-col items-center py-3 gap-3 h-full">
          <button
            onClick={() => setSidebar(true)}
            className="cb-focus p-2 rounded-lg hover:bg-cb-surface transition-colors"
            title="Open sidebar (CMD-K)"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={18} />
          </button>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--cb-accent)" }}>
            <MessageSquare size={16} className="text-white" />
          </div>
          <button onClick={() => createChat()} className="cb-focus p-2 rounded-lg hover:bg-cb-surface transition-colors" title="New chat (CMD-N)" aria-label="New chat">
            <Plus size={18} />
          </button>
          <button onClick={() => setPaletteOpen(true)} className="cb-focus p-2 rounded-lg hover:bg-cb-surface transition-colors" title="Command palette (CMD-K)" aria-label="Command palette">
            <Command size={18} />
          </button>
          <div className="flex-1" />
          <button onClick={() => setSettingsOpen(true)} className="cb-focus p-2 rounded-lg hover:bg-cb-surface" title="Settings" aria-label="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
          className="flex flex-col h-full w-full"
        >
          <div className="flex items-center gap-2 px-3 py-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm" style={{ background: "var(--cb-accent)" }}>
              <MessageSquare size={16} className="text-white" />
            </div>
            <span className="font-semibold text-base flex-1 tracking-tight">Chatbox</span>
            {isMobile ? (
              <button onClick={onCloseMobile} className="cb-focus p-1.5 rounded-lg hover:bg-cb-surface" aria-label="Close sidebar">
                <X size={16} />
              </button>
            ) : (
              <>
                <button onClick={() => setSearchOpen(!searchOpen)} className="cb-focus p-1.5 rounded-lg hover:bg-cb-surface transition-colors" title="Search" aria-label="Search chats" aria-expanded={searchOpen}>
                  <Search size={16} />
                </button>
                <button onClick={() => createChat()} className="cb-focus p-1.5 rounded-lg hover:bg-cb-surface transition-colors" title="New chat" aria-label="New chat">
                  <Plus size={16} />
                </button>
                <button onClick={() => setPaletteOpen(true)} className="cb-focus p-1.5 rounded-lg hover:bg-cb-surface transition-colors hidden md:block" title="Command palette" aria-label="Command palette">
                  <Command size={16} />
                </button>
                <button onClick={() => setSidebar(false)} className="cb-focus p-1.5 rounded-lg hover:bg-cb-surface transition-colors" title="Collapse" aria-label="Collapse sidebar">
                  <PanelLeftClose size={16} />
                </button>
              </>
            )}
          </div>

          {/* Provider indicator */}
          <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[11px]" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cb-accent)" }} />
            <span className="font-medium truncate" style={{ color: "var(--cb-text)" }}>{PROVIDER_LABELS[provider]?.name || "Provider"}</span>
          </div>

          {/* Today's spend widget */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => { setSettingsOpen(true); useStore.getState().setSettingsTab("usage"); }}
            className="mx-3 mb-2 px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-left transition-colors w-[calc(100%-1.5rem)]"
            style={{
              background: "linear-gradient(135deg, color-mix(in srgb, var(--cb-accent) 14%, transparent), color-mix(in srgb, #8b5cf6 10%, transparent))",
              border: "1px solid color-mix(in srgb, var(--cb-accent) 26%, transparent)",
            }}
            title="Open token usage dashboard"
          >
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "color-mix(in srgb, var(--cb-accent) 20%, transparent)" }}
            >
              <Activity size={14} style={{ color: "var(--cb-accent)" }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--cb-muted)" }}>Today&apos;s API cost</span>
              <span className="block text-sm font-mono font-semibold truncate">
                {formatBDT(todayUsage?.costUSD, fxRate) || "৳0"}{" "}
                <span className="text-[11px] font-normal" style={{ color: "var(--cb-muted)" }}>
                  ({formatCost(todayUsage?.costUSD) || "$0"})
                </span>
              </span>
              <span className="block text-[10px] font-mono truncate mt-0.5" style={{ color: "#a855f7" }} title="Usage Value — internal reference (৳ + USDT), not the provider charge">
                ✦ {formatValueBDT(todayUsage?.valueBDT || 0)} · {formatUSDT(todayUsage?.valueUSDT || 0) || "0 USDT"}
              </span>
            </span>
            <span className="text-[10px] shrink-0 text-right" style={{ color: "var(--cb-muted)" }}>
              {todayUsage?.requests || 0} req
              <span className="block">{formatTokenCount(todayTokenCount)} tok</span>
            </span>
          </motion.button>

          <AnimatePresence>
            {searchOpen && (
              <motion.div
                key="search"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="px-3 overflow-hidden"
              >
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => { if (!query) setSearchOpen(false); }}
                  placeholder="Search chats & messages…"
                  className="cb-focus w-full px-3 py-1.5 rounded-lg text-sm outline-none transition-colors"
                  style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto px-2 pb-2 mt-1">
            <ChatSection title="Pinned" items={pinned} activeChatId={activeChatId}
              onSelect={(id) => { setActive(id); onCloseMobile?.(); }} onDelete={deleteChat} onPin={togglePin} />
            <ChatSection title="Chats" items={regular} activeChatId={activeChatId}
              onSelect={(id) => { setActive(id); onCloseMobile?.(); }} onDelete={deleteChat} onPin={togglePin} />

            {pinned.length === 0 && regular.length === 0 && (
              <div className="px-3 py-8 text-sm text-center" style={{ color: "var(--cb-muted)" }}>
                {query ? "No matches." : "No chats yet. Start a new one."}
              </div>
            )}
          </div>

          <div className="px-3 py-3 space-y-2 border-t" style={{ borderColor: "var(--cb-border)" }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { createChat(); onCloseMobile?.(); }}
              className="cb-focus w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors"
              style={{ background: "var(--cb-accent)" }}
            >
              <Plus size={16} /> New Chat
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { createImageChat(); onCloseMobile?.(); }}
              className="cb-focus w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: "var(--cb-accent)", color: "white" }}
            >
              <ImageIcon size={16} /> Create Image
            </motion.button>

            <div className="pt-2 space-y-0.5">
              <NavRow icon={<LayoutDashboard size={15} />} label="Agent Console" hint="new" onClick={() => { onCloseMobile?.(); useUi.getState().setView("console"); }} />
              <NavRow icon={<Code2 size={15} />} label="Open IDE" hint="β" onClick={() => { onCloseMobile?.(); useUi.getState().setView("ide"); }} />
              <NavRow icon={<Command size={15} />} label="Command palette" hint="⌘K" onClick={() => { setPaletteOpen(true); onCloseMobile?.(); }} />
              <NavRow icon={<Bot size={15} />} label="Copilots" onClick={() => { setSettingsOpen(true); useStore.getState().setSettingsTab("copilots"); onCloseMobile?.(); }} />
              <NavRow icon={<SettingsIcon size={15} />} label="Settings" onClick={() => { setSettingsOpen(true); onCloseMobile?.(); }} />
              <NavRow icon={<HelpCircle size={15} />} label="Shortcuts" hint="?" onClick={() => { setSettingsOpen(true); useStore.getState().setSettingsTab("shortcuts"); onCloseMobile?.(); }} />
              <NavRow icon={<Info size={15} />} label="About" onClick={() => { setSettingsOpen(true); useStore.getState().setSettingsTab("about"); onCloseMobile?.(); }} />
            </div>
          </div>
        </motion.div>
      )}
    </motion.aside>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              onClick={onCloseMobile}
            />
            <motion.div
              initial={{ x: -288 }} animate={{ x: 0 }} exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72"
            >
              {content}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
  return content;
}

function ChatSection({ title, items, activeChatId, onSelect, onDelete, onPin }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--cb-muted)" }}>
        {title}
      </div>
      <AnimatePresence initial={false}>
        {items.map((c) => (
          <ChatRow
            key={c.id}
            chat={c}
            active={c.id === activeChatId}
            onClick={() => onSelect(c.id)}
            onDelete={() => onDelete(c.id)}
            onPin={() => onPin(c.id)}
          />
        ))}
      </AnimatePresence>
    </>
  );
}

function ChatRow({ chat, active, onClick, onDelete, onPin }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" ? onClick() : null)}
      className="group relative flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-sm mb-0.5 transition-colors"
      style={{ background: active ? "var(--cb-surface)" : "transparent" }}
    >
      {active && (
        <motion.span
          layoutId="active-chat-indicator"
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
          style={{ background: "var(--cb-accent)" }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="truncate flex-1 pl-1">{chat.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onPin(); }}
        className="cb-focus opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-cb-border transition-opacity"
        title={chat.pinned ? "Unpin" : "Pin"}
        aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
      >
        <Pin size={12} fill={chat.pinned ? "currentColor" : "none"} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="cb-focus opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-cb-border transition-opacity"
        title="Delete"
        aria-label="Delete chat"
      >
        <Trash2 size={12} />
      </button>
    </motion.div>
  );
}

function NavRow({ icon, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      className="cb-focus w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm hover:bg-cb-surface text-left transition-colors"
    >
      <span style={{ color: "var(--cb-muted)" }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <kbd className="text-[10px] px-1 py-0.5 rounded" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-muted)" }}>{hint}</kbd>}
    </button>
  );
}

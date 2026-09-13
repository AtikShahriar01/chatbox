"use client";

import { useStore, detectProvider, PROVIDER_LABELS } from "@/lib/store";
import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, Search, Lock, Star, Sparkles, Eye, Wrench, Image as ImageIcon, Brain } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function ModelSelector() {
  const apiModel = useStore((s) => s.apiModel);
  const setSetting = useStore((s) => s.setSetting);
  const recentModels = useStore((s) => s.recentModels);
  const markModelUsed = useStore((s) => s.markModelUsed);
  const pick = (id) => { setSetting("apiModel", id); markModelUsed(id); };
  const apiKey = useStore((s) => s.apiKey);
  const customModels = useStore((s) => s.customModels);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allModels = useMemo(() => {
    const seen = new Set();
    const known = [...customModels, ...useStore.getState().allModels?.() || []];
    // If the active apiModel (e.g. typed in Settings for a custom provider)
    // isn't a known built-in/custom entry, surface it as a real model so the
    // selector shows what's actually in use.
    const activeModel =
      apiModel && !known.some((m) => m.id === apiModel)
        ? { id: apiModel, name: apiModel, provider: PROVIDER_LABELS[detectProvider(apiBaseUrl)]?.name || "Custom", context: 0, builtin: false }
        : null;
    return [activeModel, ...known].filter((m) => {
      if (!m || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [customModels, apiModel, apiBaseUrl]);

  const current = allModels.find((m) => m.id === apiModel) || allModels[0];

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = allModels.filter((m) =>
      (m.name || "").toLowerCase().includes(q) ||
      (m.provider || "").toLowerCase().includes(q) ||
      (m.id || "").toLowerCase().includes(q)
    );
    if (tab === "favorites") list = list.filter((m) => favorites.includes(m.id));
    return list;
  }, [query, tab, favorites, allModels]);

  const activeProviderName = PROVIDER_LABELS[detectProvider(apiBaseUrl)]?.name;
  const currentProviderModels = filtered.filter((m) => m.provider === activeProviderName);
  const otherModels = filtered.filter((m) => m.provider !== activeProviderName);
  const customRows = otherModels.filter((m) => !m.builtin);
  const builtinRows = otherModels.filter((m) => m.builtin);
  const advanced = currentProviderModels.filter((m) => m.advanced);
  const basic = currentProviderModels.filter((m) => !m.advanced);

  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(!open)}
        className="cb-focus flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors hover:bg-cb-bg"
        style={{ background: "var(--cb-surface)", borderColor: "var(--cb-border)" }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="font-medium truncate max-w-[140px]">{current?.name || "Select model"}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full right-0 mb-2 w-80 rounded-xl shadow-2xl border overflow-hidden z-50 origin-bottom-right"
            style={{ background: "var(--cb-bg)", borderColor: "var(--cb-border)" }}
            role="listbox"
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: "var(--cb-border)" }}>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles size={14} /> {current?.name}
              </div>
              <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--cb-muted)" }}>
                {current?.context && <span>{(current.context / 1000).toFixed(0)}K tokens</span>}
                <span>·</span>
                <span>{current?.provider}</span>
                {current && (
                  <span className="flex items-center gap-1 ml-auto">
                    {current.vision && <span title="Vision"><Eye size={10} /></span>}
                    {current.tools && <span title="Tools"><Wrench size={10} /></span>}
                    {current.imageGen && <span title="Image gen"><ImageIcon size={10} /></span>}
                    {current.thinking && <span title="Thinking"><Brain size={10} /></span>}
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {recentModels?.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--cb-muted)" }}>
                    🕑 Recently used
                  </div>
                  {recentModels.filter((id) => !id.startsWith("http")).map((id) => {
                    const m = allModels.find((x) => x.id === id) || { id, name: id, provider: "", context: 0, builtin: false };
                    return (
                      <ModelRow
                        key={"recent-" + id}
                        model={m}
                        selected={m.id === apiModel}
                        locked={!apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234"))}
                        favorite={favorites.includes(m.id)}
                        onSelect={() => { pick(m.id); setOpen(false); }}
                        onFav={() => toggleFavorite(m.id)}
                      />
                    );
                  })}
                </>
              )}
              {advanced.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--cb-muted)" }}>
                    <span>Advanced · {activeProviderName}</span>
                  </div>
                  {advanced.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      selected={m.id === apiModel}
                      locked={!apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234"))}
                      favorite={favorites.includes(m.id)}
                      onSelect={() => { pick(m.id); setOpen(false); }}
                      onFav={() => toggleFavorite(m.id)}
                    />
                  ))}
                </>
              )}
              {basic.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--cb-muted)" }}>
                    Basic · {activeProviderName}
                  </div>
                  {basic.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      selected={m.id === apiModel}
                      locked={!apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234"))}
                      favorite={favorites.includes(m.id)}
                      onSelect={() => { pick(m.id); setOpen(false); }}
                      onFav={() => toggleFavorite(m.id)}
                    />
                  ))}
                </>
              )}
              {customRows.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--cb-muted)" }}>
                    Custom models
                  </div>
                  {customRows.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      selected={m.id === apiModel}
                      locked={!apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234"))}
                      favorite={favorites.includes(m.id)}
                      onSelect={() => { pick(m.id); setOpen(false); }}
                      onFav={() => toggleFavorite(m.id)}
                    />
                  ))}
                </>
              )}
              {builtinRows.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--cb-muted)" }}>
                    Other providers
                  </div>
                  {builtinRows.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      selected={m.id === apiModel}
                      locked={!apiKey && !(apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234"))}
                      favorite={favorites.includes(m.id)}
                      onSelect={() => { pick(m.id); setOpen(false); }}
                      onFav={() => toggleFavorite(m.id)}
                    />
                  ))}
                </>
              )}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-sm text-center" style={{ color: "var(--cb-muted)" }}>
                  No models match.
                </div>
              )}
            </div>

            <div className="border-t px-2 py-2 flex items-center gap-2" style={{ borderColor: "var(--cb-border)" }}>
              <div className="flex items-center gap-1 px-1 py-0.5 rounded-md" style={{ background: "var(--cb-surface)" }}>
                {["all", "favorites"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="cb-focus px-2 py-0.5 text-xs rounded capitalize transition-colors"
                    style={{ background: tab === t ? "var(--cb-accent)" : "transparent", color: tab === t ? "white" : "var(--cb-muted)" }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: "var(--cb-surface)" }}>
                <Search size={12} style={{ color: "var(--cb-muted)" }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models"
                  className="cb-focus flex-1 bg-transparent outline-none text-xs"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModelRow({ model, selected, locked, favorite, onSelect, onFav }) {
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.12 }}
      onClick={onSelect}
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm"
      style={{ background: selected ? "var(--cb-surface)" : "transparent" }}
      role="option"
      aria-selected={selected}
    >
      <span className="flex-1 truncate">{model.name}</span>
      <span className="text-[10px] flex items-center gap-0.5" style={{ color: "var(--cb-muted)" }}>
        {model.vision && <Eye size={9} />}
        {model.tools && <Wrench size={9} />}
        {model.thinking && <Brain size={9} />}
        {model.context && <span>{(model.context / 1000).toFixed(0)}K</span>}
      </span>
      {locked ? <Lock size={12} style={{ color: "var(--cb-muted)" }} /> : null}
      <button
        onClick={(e) => { e.stopPropagation(); onFav(); }}
        className="cb-focus p-0.5"
        style={{ color: favorite ? "#facc15" : "var(--cb-muted)" }}
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star size={12} fill={favorite ? "currentColor" : "none"} />
      </button>
    </motion.div>
  );
}

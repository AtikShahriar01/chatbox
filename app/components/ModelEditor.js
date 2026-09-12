"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Trash2, Edit2, Check, Eye, Wrench, Image as ImageIcon, Brain, RefreshCw, Play, PlusCircle, CheckCircle2, AlertCircle, Loader2, Tag, Sparkles, Crown, BadgeCheck, Search, Star } from "lucide-react";
import { useStore, BUILTIN_MODELS, PROVIDER_LABELS, detectProvider } from "@/lib/store";
import { lookupPrice } from "@/lib/pricing";

export default function ModelEditor({ open, onClose }) {
  const customModels = useStore((s) => s.customModels);
  const addCustomModel = useStore((s) => s.addCustomModel);
  const updateCustomModel = useStore((s) => s.updateCustomModel);
  const removeCustomModel = useStore((s) => s.removeCustomModel);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const apiKey = useStore((s) => s.apiKey);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const [editing, setEditing] = useState(null); // null = list, "new" = add, id = edit
  const [fetched, setFetched] = useState(null); // { ok, models, provider, providerName, error }
  const [fetching, setFetching] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [listTab, setListTab] = useState("all");
  // Per-model test status: { [id]: "testing" | { ok, reply, model } }
  const [testStatus, setTestStatus] = useState({});

  const fetchModels = async () => {
    setFetching(true);
    setFetched(null);
    setTestStatus({});
    try {
      const res = await fetch("/api/chat/list-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl, apiKey }),
      });
      const data = await res.json();
      if (data.ok) setFetched(data);
      else setFetched({ ok: false, error: data.error });
    } catch (e) {
      setFetched({ ok: false, error: String(e?.message || e) });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (open) {
      setFetched(null);
      setTestStatus({});
    }
  }, [open]);

  const testModel = async (id) => {
    setTestStatus((s) => ({ ...s, [id]: "testing" }));
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl, apiKey, apiModel: id }),
      });
      const data = await res.json();
      setTestStatus((s) => ({ ...s, [id]: data }));
    } catch (e) {
      setTestStatus((s) => ({ ...s, [id]: { ok: false, error: String(e?.message || e) } }));
    }
  };

  const quickAdd = (id) => {
    const provider = fetched?.providerName || "Custom";
    addCustomModel({ id, name: id, provider, context: 128000 });
  };

  const isAlreadyAdded = (id) => BUILTIN_MODELS.some((m) => m.id === id) || customModels.some((m) => m.id === id);

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
            className="w-full max-w-3xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--cb-border)" }}>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Models</h3>
                <p className="text-xs" style={{ color: "var(--cb-muted)" }}>
                  Manage built-in and custom models for the current provider.
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-cb-surface" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Fetch from /models */}
              <div
                className="rounded-lg p-3 relative overflow-hidden"
                style={{
                  background: "var(--cb-surface)",
                  border: "1px solid var(--cb-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Sparkles size={14} style={{ color: "var(--cb-accent)" }} />
                      Fetch from provider
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: "var(--cb-muted)" }}>
                      GET {apiBaseUrl}/models
                    </div>
                  </div>
                  <button
                    onClick={fetchModels}
                    disabled={fetching}
                    className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    style={{ background: "var(--cb-accent)", color: "white" }}
                  >
                    {fetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {fetching ? "Fetching..." : "Fetch models"}
                  </button>
                </div>
                {fetched && (
                  <div className="mt-2">
                    {fetched.ok ? (
                      <>
                        <div className="text-xs mb-1.5 flex items-center gap-2" style={{ color: "var(--cb-muted)" }}>
                          <span>
                            <strong style={{ color: "var(--cb-text)" }}>{fetched.models.length}</strong> models from{" "}
                            <strong style={{ color: "var(--cb-accent)" }}>{fetched.providerName}</strong>
                          </span>
                          <span>·</span>
                          <span>Click <PlusCircle size={10} className="inline" /> to add · <Play size={10} className="inline" /> to test</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto rounded-md p-1.5 text-xs space-y-0.5" style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}>
                          {fetched.models.map((id) => {
                            const status = testStatus[id];
                            const testing = status === "testing";
                            const ok = status && typeof status === "object" && status.ok;
                            const fail = status && typeof status === "object" && !status.ok;
                            const added = isAlreadyAdded(id);
                            const price = lookupPrice(id);
                            return (
                              <div
                                key={id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-cb-border transition-colors group"
                              >
                                <span className="font-mono truncate flex-1" title={id}>{id}</span>
                                {price && <PriceTag price={price} />}
                                {testing && <Loader2 size={11} className="animate-spin" style={{ color: "var(--cb-muted)" }} />}
                                {ok && <CheckCircle2 size={11} style={{ color: "#22c55e" }} />}
                                {fail && <AlertCircle size={11} style={{ color: "#ef4444" }} />}
                                <button
                                  onClick={() => testModel(id)}
                                  disabled={testing}
                                  className="p-1 rounded opacity-60 group-hover:opacity-100 hover:bg-cb-surface transition-opacity"
                                  title="Test this model"
                                  aria-label={`Test model ${id}`}
                                  style={{ color: "var(--cb-muted)" }}
                                >
                                  <Play size={10} />
                                </button>
                                <button
                                  onClick={() => quickAdd(id)}
                                  disabled={added}
                                  className="p-1 rounded opacity-60 group-hover:opacity-100 hover:bg-cb-surface transition-opacity disabled:opacity-30"
                                  title={added ? "Already added" : "Add to custom models"}
                                  aria-label={`Add model ${id}`}
                                  style={{ color: added ? "#22c55e" : "var(--cb-accent)" }}
                                >
                                  {added ? <CheckCircle2 size={10} /> : <PlusCircle size={10} />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {Object.values(testStatus).some((s) => s && typeof s === "object" && !s.ok) && (
                          <div className="text-[11px] mt-2 text-red-400">
                            {Object.entries(testStatus)
                              .filter(([, s]) => s && typeof s === "object" && !s.ok)
                              .map(([id, s]) => `${id}: ${s.error || "failed"}`)
                              .join(" · ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle size={12} /> {fetched.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Built-in + Custom lists with search & favourites */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider flex-1" style={{ color: "var(--cb-muted)" }}>
                    All models
                  </h4>
                  <div className="flex items-center gap-1 px-1 py-0.5 rounded-md" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
                    {["all", "favorites"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setListTab(t)}
                        className="cb-focus px-2 py-0.5 text-xs rounded capitalize transition-colors"
                        style={{ background: listTab === t ? "var(--cb-accent)" : "transparent", color: listTab === t ? "white" : "var(--cb-muted)" }}
                      >
                        {t === "favorites" ? "★ Favourites" : "All"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md mb-2" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
                  <Search size={12} style={{ color: "var(--cb-muted)" }} />
                  <input
                    value={listQuery}
                    onChange={(e) => setListQuery(e.target.value)}
                    placeholder="Search models by name, id, provider…"
                    className="cb-focus flex-1 bg-transparent outline-none text-xs"
                  />
                  {listQuery && (
                    <button onClick={() => setListQuery("")} aria-label="Clear search" className="p-0.5" style={{ color: "var(--cb-muted)" }}>
                      <X size={10} />
                    </button>
                  )}
                </div>

                {(() => {
                  const q = listQuery.toLowerCase();
                  let all = [...BUILTIN_MODELS, ...customModels];
                  if (q) {
                    all = all.filter((m) =>
                      (m.name || "").toLowerCase().includes(q) ||
                      (m.id || "").toLowerCase().includes(q) ||
                      (m.provider || "").toLowerCase().includes(q)
                    );
                  }
                  if (listTab === "favorites") all = all.filter((m) => favorites.includes(m.id));
                  if (all.length === 0) {
                    return (
                      <div className="text-sm text-center py-6 rounded-lg" style={{ color: "var(--cb-muted)", background: "var(--cb-surface)", border: "1px dashed var(--cb-border)" }}>
                        {listQuery || listTab === "favorites" ? "No matching models." : "No models."}
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--cb-border)" }}>
                      {all.map((m) => (
                        <ModelRow
                          key={m.id}
                          model={m}
                          locked={!!m.builtin}
                          favorite={favorites.includes(m.id)}
                          onFav={() => toggleFavorite(m.id)}
                          onEdit={m.builtin ? undefined : () => setEditing(m)}
                          onDelete={m.builtin ? undefined : () => removeCustomModel(m.id)}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--cb-border)" }}>
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
        <ModelForm
          key={editing.id || "new"}
          model={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            if (editing === "new") addCustomModel(m);
            else updateCustomModel(editing.id, m);
            setEditing(null);
          }}
        />
      )}
    </AnimatePresence>
  );
}

function ModelRow({ model, locked, onEdit, onDelete, favorite, onFav }) {
  const price = model.priceInput != null ? { input: model.priceInput, output: model.priceOutput } : lookupPrice(model.id);
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderBottom: "1px solid var(--cb-border)" }}>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1.5">
          {model.name}
          {!locked && <span className="text-[9px] px-1 rounded font-medium" style={{ background: "color-mix(in srgb, var(--cb-accent) 14%, transparent)", color: "var(--cb-accent)" }}>CUSTOM</span>}
        </div>
        <div className="text-[11px] font-mono truncate" style={{ color: "var(--cb-muted)" }}>{model.id}</div>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--cb-surface)", color: "var(--cb-muted)" }}>
        {model.provider}
      </span>
      {price && <PriceTag price={price} />}
      <CapabilityBadge ok={model.vision} label="vision" icon={Eye} />
      <CapabilityBadge ok={model.tools} label="tools" icon={Wrench} />
      <CapabilityBadge ok={model.imageGen} label="img" icon={ImageIcon} />
      <CapabilityBadge ok={model.thinking} label="think" icon={Brain} />
      {onFav && (
        <button
          onClick={onFav}
          className="cb-focus p-1 rounded hover:bg-cb-border transition-colors"
          style={{ color: favorite ? "#facc15" : "var(--cb-muted)" }}
          aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
          title={favorite ? "Remove from favourites" : "Add to favourites"}
        >
          <Star size={13} fill={favorite ? "currentColor" : "none"} />
        </button>
      )}
      {!locked ? (
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1 rounded hover:bg-cb-border" aria-label="Edit">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-cb-border text-red-400" aria-label="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PriceTag({ price }) {
  if (!price || price.input == null) return null;
  const tier = price.input === 0 ? "free" : price.input < 1 ? "cheap" : price.input < 10 ? "mid" : "premium";
  const config = {
    free:    { icon: BadgeCheck, label: "Free",          bg: "rgba(34,197,94,0.14)",  fg: "#22c55e" },
    cheap:   { icon: Sparkles,   label: "$",             bg: "rgba(34,197,94,0.10)",  fg: "#22c55e" },
    mid:     { icon: Sparkles,   label: `$${price.input.toFixed(1)}/M`, bg: "rgba(245,158,11,0.14)", fg: "#f59e0b" },
    premium: { icon: Crown,      label: `$${price.input.toFixed(1)}/M`, bg: "rgba(239,68,68,0.14)",  fg: "#ef4444" },
  }[tier];
  const Icon = config.icon;
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 font-medium"
      style={{ background: config.bg, color: config.fg }}
      title={`In: $${price.input}/1M, Out: $${price.output}/1M`}
    >
      <Icon size={9} /> {config.label}
    </span>
  );
}

function CapabilityBadge({ ok, label, icon: Icon }) {
  if (!ok) return null;
  return (
    <span title={label} className="text-[10px] p-1 rounded inline-flex items-center" style={{ background: "color-mix(in srgb, var(--cb-accent) 14%, transparent)", color: "var(--cb-accent)" }}>
      <Icon size={10} />
    </span>
  );
}

function ModelForm({ model, onClose, onSave }) {
  const [form, setForm] = useState(model || { id: "", name: "", provider: "Custom", context: 128000, vision: false, tools: false, imageGen: false, thinking: false, priceInput: null, priceOutput: null });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ok = form.id && form.name;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
        className="w-full max-w-md rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold tracking-tight">{model ? "Edit model" : "Add custom model"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-cb-surface" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Display name">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="My custom model" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
          </Field>
          <Field label="Model id">
            <input value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="openai/gpt-4o-mini" className="cb-focus w-full px-3 py-2 rounded text-sm font-mono" style={inputStyle} />
          </Field>
          <Field label="Provider">
            <input value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="OpenAI" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
          </Field>
          <Field label="Context window (tokens)">
            <input type="number" value={form.context} onChange={(e) => set("context", parseInt(e.target.value) || 0)} min="0" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Vision" on={form.vision} onChange={(v) => set("vision", v)} />
            <Toggle label="Tools" on={form.tools} onChange={(v) => set("tools", v)} />
            <Toggle label="Image gen" on={form.imageGen} onChange={(v) => set("imageGen", v)} />
            <Toggle label="Thinking" on={form.thinking} onChange={(v) => set("thinking", v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Price in ($/1M tok)">
              <input type="number" step="0.01" value={form.priceInput ?? ""} onChange={(e) => set("priceInput", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="auto" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </Field>
            <Field label="Price out ($/1M tok)">
              <input type="number" step="0.01" value={form.priceOutput ?? ""} onChange={(e) => set("priceOutput", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="auto" className="cb-focus w-full px-3 py-2 rounded text-sm" style={inputStyle} />
            </Field>
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
            <Check size={14} /> {model ? "Save" : "Add model"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="cb-focus flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors"
      style={{ background: on ? "color-mix(in srgb, var(--cb-accent) 14%, transparent)" : "var(--cb-surface)", border: "1px solid var(--cb-border)", color: on ? "var(--cb-accent)" : "var(--cb-text)" }}
    >
      <span>{label}</span>
      <span className="w-8 h-4 rounded-full relative" style={{ background: on ? "var(--cb-accent)" : "var(--cb-border)" }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: on ? "calc(100% - 14px)" : "2px" }} />
      </span>
    </button>
  );
}

const inputStyle = { background: "var(--cb-surface)", border: "1px solid var(--cb-border)" };

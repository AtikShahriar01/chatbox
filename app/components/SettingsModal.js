"use client";

import { useStore, PROVIDER_LABELS, detectProvider } from "@/lib/store";
import { X, Check, Database, Bot, Keyboard, Info, RefreshCw, Download, Upload, Sparkles, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { transitionTheme } from "@/lib/useTheme";
import ModelEditor from "./ModelEditor";
import CopilotEditor from "./CopilotEditor";
import TokenUsage from "./TokenUsage";
import PcAgentPanel from "./PcAgentPanel";

const SECTIONS = [
  { key: "general", label: "General", icon: null },
  { key: "chat", label: "Chat Settings", icon: null },
  { key: "provider", label: "Model Provider", icon: null },
  { key: "models", label: "Models", icon: null },
  { key: "copilots", label: "Copilots", icon: null },
  { key: "memory", label: "Memory", icon: null },
  { key: "pc", label: "PC Access", icon: null },
  { key: "shortcuts", label: "Shortcuts", icon: null },
  { key: "data", label: "Data", icon: null },
  { key: "usage", label: "Token Usage", icon: null },
  { key: "about", label: "About", icon: null },
];

const PRESETS = [
  { id: "default", label: "Default" },
  { id: "claude-classic", label: "Claude Classic" },
  { id: "mist-blue", label: "Mist Blue" },
];

export default function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const tab = useStore((s) => s.settingsTab);
  const setTab = useStore((s) => s.setSettingsTab);
  const pushToast = useStore((s) => s.pushToast);

  const theme = useStore((s) => s.theme);
  const customColor = useStore((s) => s.customColor);
  const mode = useStore((s) => s.mode);
  const language = useStore((s) => s.language);
  const fontSize = useStore((s) => s.fontSize);
  const systemPrompt = useStore((s) => s.systemPrompt);
  const maxContext = useStore((s) => s.maxContextMessages);
  const temperature = useStore((s) => s.temperature);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);
  const apiKey = useStore((s) => s.apiKey);
  const apiModel = useStore((s) => s.apiModel);
  const setSetting = useStore((s) => s.setSetting);
  const sessionKeyOnly = useStore((s) => s.sessionKeyOnly);
  const providers = useStore((s) => s.providers);
  const activeProviderId = useStore((s) => s.activeProviderId);
  const saveProvider = useStore((s) => s.saveProvider);
  const setActiveProvider = useStore((s) => s.setActiveProvider);
  const duplicateProvider = useStore((s) => s.duplicateProvider);
  const removeProvider = useStore((s) => s.removeProvider);
  const updateProvider = useStore((s) => s.updateProvider);
  const defaultModel = useStore((s) => s.defaultModel);
  const fallbackModel = useStore((s) => s.fallbackModel);
  const setDefaultModel = useStore((s) => s.setDefaultModel);
  const setFallbackModel = useStore((s) => s.setFallbackModel);
  const memory = useStore((s) => s.memory);
  const toggleMemory = useStore((s) => s.toggleMemory);
  const rememberMemory = useStore((s) => s.rememberMemory);
  const forgetMemory = useStore((s) => s.forgetMemory);
  const clearMemory = useStore((s) => s.clearMemory);
  const chats = useStore((s) => s.chats);
  const copilots = useStore((s) => s.copilots);
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [copilotEditorOpen, setCopilotEditorOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const provider = detectProvider(apiBaseUrl);
  const providerInfo = PROVIDER_LABELS[provider];

  const applyTheme = (key, value) => transitionTheme(() => setSetting(key, value));

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl, apiKey, apiModel }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) pushToast({ type: "success", message: "Connection successful." });
      else pushToast({ type: "error", message: data.error || "Connection failed." });
    } catch (e) {
      setTestResult({ ok: false, error: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  const exportData = () => {
    const data = {
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: { theme, customColor, mode, language, fontSize, systemPrompt, maxContext, temperature, apiBaseUrl, apiModel, apiKey: apiKey ? "***" : "" },
      chats,
      copilots,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatbox-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({ type: "success", message: "Exported to downloads." });
  };

  const importData = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.chats) useStore.setState({ chats: d.chats });
        if (d.copilots) useStore.setState({ copilots: d.copilots });
        if (d.settings) {
          for (const [k, v] of Object.entries(d.settings)) {
            if (k === "apiKey" && v === "***") continue;
            setSetting(k, v);
          }
        }
        pushToast({ type: "success", message: "Imported successfully." });
      } catch (e) {
        pushToast({ type: "error", message: "Import failed: " + String(e?.message || e) });
      }
    };
    r.readAsText(file);
  };

  // Map "models"/"copilots" tabs to their editor overlays. When the user
  // switches to any other tab, close any open editor so it can't cover and
  // block the tab list (that made later tabs feel "broken"/unclickable).
  useEffect(() => {
    if (!open) return;
    if (tab === "models") setModelEditorOpen(true);
    else if (tab === "copilots") setCopilotEditorOpen(true);
    else {
      setModelEditorOpen(false);
      setCopilotEditorOpen(false);
    }
  }, [open, tab]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            role="dialog" aria-modal="true" aria-label="Settings"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
              style={{ background: "var(--cb-bg)", borderColor: "var(--cb-border)" }}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--cb-border)" }}>
                <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="cb-focus px-2 py-1 rounded text-sm flex items-center gap-1 hover:bg-cb-surface transition-colors"
                  style={{ color: "var(--cb-muted)" }}
                  aria-label="Close"
                >
                  ESC <X size={14} />
                </button>
              </div>

              <div className="flex flex-1 min-h-0">
                <nav className="w-52 border-r p-2 space-y-0.5 relative overflow-y-auto" style={{ borderColor: "var(--cb-border)" }}>
                  {SECTIONS.map((s) => {
                    const active = tab === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => { setTab(s.key); if (s.key === "models") setModelEditorOpen(true); if (s.key === "copilots") setCopilotEditorOpen(true); }}
                        className="cb-focus relative w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                        style={{ color: active ? "white" : "var(--cb-text)" }}
                      >
                        {active && (
                          <motion.span
                            layoutId="settings-tab-bg"
                            className="absolute inset-0 rounded-lg"
                            style={{ background: "var(--cb-accent)" }}
                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{s.label}</span>
                      </button>
                    );
                  })}
                </nav>

                <div className="flex-1 overflow-y-auto p-6">
                  <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                  {tab === "general" && (
                    <div className="space-y-6">
                      <h3 className="text-base font-semibold tracking-tight">Display Settings</h3>
                      <Row label="Language">
                        <select value={language} onChange={(e) => setSetting("language", e.target.value)} className="cb-focus px-3 py-1.5 rounded text-sm w-64" style={inputStyle}>
                          <option value="en">English</option>
                          <option value="bn">বাংলা (Bengali)</option>
                          <option value="es">Español</option>
                          <option value="zh">中文</option>
                          <option value="fr">Français</option>
                        </select>
                      </Row>
                      <Row label="Theme">
                        <select value={mode} onChange={(e) => applyTheme("mode", e.target.value)} className="cb-focus px-3 py-1.5 rounded text-sm w-64" style={inputStyle}>
                          <option value="system">Follow System</option>
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      </Row>
                      <Row label="Color Presets">
                        <div className="flex items-center gap-2 flex-wrap">
                          {PRESETS.map((p) => (
                            <motion.button
                              key={p.id}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => applyTheme("theme", p.id)}
                              className="cb-focus px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                              style={{
                                background: theme === p.id ? "var(--cb-accent)" : "var(--cb-surface)",
                                color: theme === p.id ? "white" : "var(--cb-text)",
                                border: "1px solid var(--cb-border)",
                              }}
                            >
                              {p.label}
                            </motion.button>
                          ))}
                          <input
                            type="color"
                            value={customColor}
                            onChange={(e) => { setSetting("theme", "custom"); setSetting("customColor", e.target.value); }}
                            className="cb-focus w-8 h-8 rounded cursor-pointer"
                            title="Custom color"
                            aria-label="Custom accent color"
                          />
                        </div>
                      </Row>
                      <Row label="Font Size">
                        <input type="range" min="12" max="20" value={fontSize} onChange={(e) => setSetting("fontSize", parseInt(e.target.value))} className="w-64" />
                        <span className="text-xs ml-2" style={{ color: "var(--cb-muted)" }}>{fontSize}px</span>
                      </Row>
                    </div>
                  )}

                  {tab === "chat" && (
                    <div className="space-y-6">
                      <h3 className="text-base font-semibold tracking-tight">Default Chat Settings</h3>
                      <Row label="Active Copilot">
                        <select
                          value={useStore.getState().activeCopilotId}
                          onChange={(e) => useStore.getState().setActiveCopilot(e.target.value)}
                          className="cb-focus px-3 py-1.5 rounded text-sm w-64"
                          style={inputStyle}
                        >
                          {copilots.map((c) => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      </Row>
                      <Row label="System Prompt">
                        <textarea value={systemPrompt} onChange={(e) => setSetting("systemPrompt", e.target.value)} rows={3} className="cb-focus w-full max-w-xl px-3 py-2 rounded text-sm transition-colors" style={inputStyle} />
                      </Row>
                      <Row label="Max Message Count in Context">
                        <input type="range" min="5" max="100" step="5" value={maxContext} onChange={(e) => setSetting("maxContextMessages", parseInt(e.target.value))} className="w-64" />
                        <span className="text-xs ml-2" style={{ color: "var(--cb-muted)" }}>{maxContext}{maxContext === 100 ? " (No Limit)" : ""}</span>
                      </Row>
                      <Row label="Temperature">
                        <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setSetting("temperature", parseFloat(e.target.value))} className="w-64" />
                        <span className="text-xs ml-2" style={{ color: "var(--cb-muted)" }}>{temperature.toFixed(1)}</span>
                      </Row>
                    </div>
                  )}

                  {tab === "provider" && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold tracking-tight">Model Provider</h3>
                        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--cb-muted)" }}>
                          <span>Detected:</span>
                          <span className="px-2 py-0.5 rounded font-medium" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)", color: "var(--cb-accent)" }}>
                            {providerInfo?.name}
                          </span>
                          <span>·</span>
                          <span>{providerInfo?.protocol}</span>
                        </div>
                      </div>
                      <div className="rounded-lg p-3 text-xs" style={{ background: "color-mix(in srgb, var(--cb-accent) 8%, transparent)", border: "1px solid var(--cb-border)" }}>
                        💡 {providerInfo?.hint}
                      </div>
                      <Row label="API Base URL">
                        <input value={apiBaseUrl} onChange={(e) => setSetting("apiBaseUrl", e.target.value)} placeholder="https://api.openai.com/v1" className="cb-focus w-full max-w-xl px-3 py-2 rounded text-sm transition-colors" style={inputStyle} />
                      </Row>
                      <Row label="API Key">
                        <input type="password" value={apiKey} onChange={(e) => setSetting("apiKey", e.target.value)} placeholder={apiBaseUrl.includes("11434") || apiBaseUrl.includes("1234") ? "(no key needed for local)" : "sk-..."} className="cb-focus w-full max-w-xl px-3 py-2 rounded text-sm transition-colors" style={inputStyle} />
                      </Row>
                      <Row label="">
                        <label className="cb-focus flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "var(--cb-muted)" }}>
                          <input type="checkbox" checked={!!sessionKeyOnly} onChange={(e) => setSetting("sessionKeyOnly", e.target.checked)} />
                          🔐 এই ডিভাইসে key মনে রাখবে না — শুধু এই সেশনে (reload-এ মুছে যাবে)
                        </label>
                      </Row>
                      <Row label="Model">
                        <input value={apiModel} onChange={(e) => setSetting("apiModel", e.target.value)} placeholder="openai/gpt-4o-mini" className="cb-focus w-full max-w-xl px-3 py-2 rounded text-sm transition-colors" style={inputStyle} />
                      </Row>
                      <Row label="Default / Fallback">
                        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--cb-muted)" }}>
                          <button onClick={() => setDefaultModel(apiModel)} className="cb-focus px-2 py-1 rounded border" style={{ borderColor: "var(--cb-border)" }}>★ “{apiModel}” = Default</button>
                          <button onClick={() => setFallbackModel(apiModel)} className="cb-focus px-2 py-1 rounded border" style={{ borderColor: "var(--cb-border)" }}>↩ “{apiModel}” = Fallback</button>
                          <span className="text-[10.5px]">default: <b>{defaultModel || "—"}</b> · fallback: <b>{fallbackModel || "—"}</b></span>
                        </div>
                      </Row>
                      <div className="flex items-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={testConnection}
                          disabled={testing}
                          className="cb-focus px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                          style={{ background: "var(--cb-accent)", color: "white" }}
                        >
                          <RefreshCw size={12} className={testing ? "animate-spin" : ""} /> {testing ? "Testing..." : "Test connection"}
                        </motion.button>
                        {testResult && (
                          <div className="text-xs" style={{ color: testResult.ok ? "var(--cb-accent)" : "#ef4444" }}>
                            {testResult.ok ? "✓ OK" : "✗ " + (testResult.error || "Failed")}
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--cb-surface)", color: "var(--cb-muted)" }}>
                        <strong style={{ color: "var(--cb-text)" }}>Works with:</strong> OpenAI · OpenRouter · Anthropic · Google Gemini · Groq · DeepSeek · Mistral · xAI · Together · Fireworks · Cohere · Ollama (set base to <code>http://localhost:11434/v1</code>) · LM Studio · vLLM · any OpenAI-compatible endpoint.
                      </div>

                      {/* ── Universal Provider Engine (directive §6) ── */}
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">🧩 Saved Providers</h4>
                          <button onClick={() => { const n = window.prompt("Provider-এর নাম?", apiModel || "My Provider"); if (n) saveProvider({ name: n }); }} className="cb-focus px-2.5 py-1 rounded text-xs font-medium" style={{ background: "var(--cb-accent)", color: "white" }}>+ Save current</button>
                        </div>
                        {!providers?.length && <p className="text-xs" style={{ color: "var(--cb-muted)" }}>baseUrl/key/model সেট করে <b>Save current</b> চাপুন — বহু provider save করে switch করা যাবে।</p>}
                        <div className="space-y-2">
                          {(providers || []).map((p) => {
                            const active = p.id === activeProviderId;
                            return (
                              <div key={p.id} className="rounded-lg border p-2.5" style={{ borderColor: active ? "var(--cb-accent)" : "var(--cb-border)", background: active ? "color-mix(in srgb, var(--cb-accent) 6%, transparent)" : "var(--cb-surface)" }}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium" style={{ color: "var(--cb-text)" }}>{p.name}</span>
                                  {active && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--cb-accent)", color: "white" }}>active</span>}
                                  <div className="ml-auto flex gap-1.5 text-[11px]">
                                    {!active && <button onClick={() => setActiveProvider(p.id)} className="cb-focus underline" style={{ color: "var(--cb-accent)" }}>Load</button>}
                                    <button onClick={() => duplicateProvider(p.id)} className="cb-focus underline" style={{ color: "var(--cb-muted)" }}>Duplicate</button>
                                    <button onClick={() => removeProvider(p.id)} className="cb-focus underline" style={{ color: "#ef4444" }}>Delete</button>
                                  </div>
                                </div>
                                <div className="text-[10.5px] font-mono mt-1 truncate" style={{ color: "var(--cb-muted)" }}>{p.baseUrl} · {p.model || "(no model)"}</div>
                                {active && (
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                                    {["streaming", "vision", "tools", "reasoning", "image", "audio", "embedding"].map((cap) => (
                                      <label key={cap} className="flex items-center gap-1 text-[10.5px]" style={{ color: "var(--cb-muted)" }}>
                                        <input type="checkbox" checked={!!(p.capabilities || {})[cap]} onChange={(e) => updateProvider(p.id, { capabilities: { ...p.capabilities, [cap]: e.target.checked } })} />
                                        {cap}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === "models" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">Models</h3>
                      <p className="text-sm" style={{ color: "var(--cb-muted)" }}>
                        Manage built-in and custom models for the current provider.
                      </p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setModelEditorOpen(true)}
                        className="cb-focus px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: "var(--cb-accent)" }}
                      >
                        Open model manager
                      </motion.button>
                    </div>
                  )}

                  {tab === "copilots" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">Copilots</h3>
                      <p className="text-sm" style={{ color: "var(--cb-muted)" }}>
                        Reusable personas — switch per chat.
                      </p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setCopilotEditorOpen(true)}
                        className="cb-focus px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: "var(--cb-accent)" }}
                      >
                        Open copilot manager
                      </motion.button>
                    </div>
                  )}

                  {tab === "pc" && (
                    <PcAgentPanel />
                  )}

                  {tab === "shortcuts" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">Keyboard Shortcuts</h3>
                      <div className="text-sm space-y-2">
                        <Shortcut k="Enter" v="Send message" />
                        <Shortcut k="Shift + Enter" v="New line" />
                        <Shortcut k="Esc" v="Stop generating / close modal" />
                        <Shortcut k="⌘/Ctrl + K" v="Command palette" />
                        <Shortcut k="⌘/Ctrl + N" v="New chat" />
                        <Shortcut k="⌘/Ctrl + I" v="Focus input" />
                        <Shortcut k="?" v="This help" />
                      </div>
                    </div>
                  )}

                  {tab === "memory" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold tracking-tight">🧠 Memory</h3>
                          <p className="text-sm" style={{ color: "var(--cb-muted)" }}>Long-term facts injected into every prompt — you fully control them.</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={!!memory?.enabled} onChange={(e) => toggleMemory(e.target.checked)} />
                          Enabled
                        </label>
                      </div>
                      {[["profile", "👤 About you"], ["agent", "🤖 Agent notes"]].map(([kind, label]) => (
                        <div key={kind}>
                          <div className="mb-1 flex items-center justify-between">
                            <h4 className="text-[13px] font-medium">{label}</h4>
                            <button onClick={() => { const v = window.prompt("নতুন memory:"); if (v) rememberMemory(kind, v); }} className="cb-focus text-xs underline" style={{ color: "var(--cb-accent)" }}>+ Add</button>
                          </div>
                          {(memory?.[kind] || []).map((item, i) => (
                            <div key={i} className="mb-1 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm" style={{ background: "var(--cb-surface)" }}>
                              <span className="min-w-0 flex-1 break-words">{item}</span>
                              <button onClick={() => forgetMemory(kind, i)} className="shrink-0 text-xs" style={{ color: "#ef4444" }}>✕</button>
                            </div>
                          ))}
                          {!(memory?.[kind] || []).length && <p className="text-[11px]" style={{ color: "var(--cb-muted)" }}>খালি — + Add চাপুন।</p>}
                        </div>
                      ))}
                      <div>
                        <h4 className="mb-1 text-[13px] font-medium">📁 Project notes</h4>
                        {Object.entries(memory?.project || {}).length === 0 && <p className="text-[11px]" style={{ color: "var(--cb-muted)" }}>এখনো কোনো project memory নেই।</p>}
                        {Object.entries(memory?.project || {}).map(([ws, notes]) => (
                          <div key={ws} className="mb-2">
                            <p className="font-mono text-[10.5px]" style={{ color: "var(--cb-muted)" }}>{ws}</p>
                            {(notes || []).map((item, i) => (
                              <div key={i} className="mb-1 flex items-start gap-2 rounded px-2.5 py-1 text-sm" style={{ background: "var(--cb-surface)" }}>
                                <span className="min-w-0 flex-1 break-words">{item}</span>
                                <button onClick={() => forgetMemory("project", i, ws)} className="shrink-0 text-xs" style={{ color: "#ef4444" }}>✕</button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => clearMemory("all")} className="cb-focus rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "#ef4444", color: "#ef4444" }}>🗑️ Clear all memory</button>
                      </div>
                    </div>
                  )}

                  {tab === "data" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">Data</h3>
                      <p className="text-sm" style={{ color: "var(--cb-muted)" }}>
                        Export and import your chats, settings, and copilots.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={exportData}
                          className="cb-focus px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm flex items-center gap-1.5"
                          style={{ background: "var(--cb-accent)" }}
                        >
                          <Download size={14} /> Export
                        </motion.button>
                        <label className="cb-focus px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1.5 transition-colors" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
                          <Upload size={14} /> Import
                          <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
                        </label>
                      </div>
                    </div>
                  )}

                  {tab === "usage" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">Token Usage</h3>
                      <TokenUsage />
                    </div>
                  )}

                  {tab === "about" && (
                    <div className="space-y-4">
                      <h3 className="text-base font-semibold tracking-tight">About</h3>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--cb-muted)" }}>
                        <strong style={{ color: "var(--cb-text)" }}>Chatbox Clone v3</strong> — a local-first, multi-model AI chat client. Built with Next.js 14, Tailwind, Motion, and Zustand. Inspired by <a href="https://web.chatboxai.app" className="underline" target="_blank" rel="noreferrer">web.chatboxai.app</a>.
                      </p>
                      <ul className="text-xs space-y-1" style={{ color: "var(--cb-muted)" }}>
                        <li>• 8+ built-in models, 12+ providers, custom model support</li>
                        <li>• Local-first storage — your data never leaves your browser</li>
                        <li>• Streaming responses with reasoning blocks, stop button, edit & resend</li>
                        <li>• CMD-K command palette, branching, copilots, image upload</li>
                        <li>• Open source, MIT licensed</li>
                      </ul>
                    </div>
                  )}
                  </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="px-6 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--cb-border)" }}>
                <button
                  onClick={() => setOpen(false)}
                  className="cb-focus px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
                  style={{ background: "var(--cb-accent)" }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModelEditor open={modelEditorOpen} onClose={() => { setModelEditorOpen(false); setTab("general"); }} />
      <CopilotEditor open={copilotEditorOpen} onClose={() => { setCopilotEditorOpen(false); setTab("general"); }} />
    </>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Shortcut({ k, v }) {
  return (
    <div className="flex items-center gap-3">
      <kbd className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
        {k}
      </kbd>
      <span style={{ color: "var(--cb-muted)" }}>{v}</span>
    </div>
  );
}

const inputStyle = { background: "var(--cb-surface)", border: "1px solid var(--cb-border)" };

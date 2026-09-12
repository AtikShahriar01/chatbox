"use client";

import { useStore } from "@/lib/store";
import { ArrowUp, Paperclip, Image as ImageIcon, Mic, Square, X, ChevronDown, Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import ModelSelector from "./ModelSelector";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Speech recognition languages. UI language → BCP-47 voice code.
const VOICE_LANGS = [
  { code: "en-US", label: "English", flag: "🇺🇸" },
  { code: "bn-BD", label: "বাংলা", flag: "🇧🇩" },
  { code: "es-ES", label: "Español", flag: "🇪🇸" },
  { code: "zh-CN", label: "中文", flag: "🇨🇳" },
  { code: "fr-FR", label: "Français", flag: "🇫🇷" },
  { code: "hi-IN", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ar-SA", label: "العربية", flag: "🇸🇦" },
];
const UI_TO_VOICE = { en: "en-US", bn: "bn-BD", es: "es-ES", zh: "zh-CN", fr: "fr-FR" };

const VOICE_ERRORS = {
  "not-allowed": { en: "Microphone permission denied. Allow it in your browser.", bn: "মাইক্রোফোনের অনুমতি দেওয়া হয়নি। ব্রাউজারে allow করুন।" },
  "service-not-allowed": { en: "Speech service blocked by browser settings.", bn: "ব্রাউজার সেটিংসে স্পিচ সার্ভিস বন্ধ আছে।" },
  "no-speech": { en: "No speech detected. Try speaking closer to the mic.", bn: "কোনো কথা ধরা পড়েনি। মাইকের কাছে বলুন।" },
  "audio-capture": { en: "No microphone found. Connect one and retry.", bn: "মাইক্রোফোন পাওয়া যায়নি। যুক্ত করে আবার চেষ্টা করুন।" },
  "network": { en: "Network error during recognition. Check your connection.", bn: "চিনামতে নেটওয়ার্ক সমস্যা। ইন্টারনেট দেখুন।" },
  aborted: { en: "", bn: "" },
};

export default function ChatInput({ onSend, disabled, stop, busy, webSearch, onToggleWebSearch }) {
  const [text, setText] = useState("");
  const clipCabinet = useStore((s) => s.clipCabinet);
  const pushClip = useStore((s) => s.pushClip);
  const pushToast = useStore((s) => s.pushToast);
  const chatInputDraft = useStore((s) => s.chatInputDraft);
  const setChatInputDraft = useStore((s) => s.setChatInputDraft);
  const [images, setImages] = useState([]); // data URLs
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordingRef = useRef(false); // mirrors recording for async handlers
  const errorRef = useRef(false);      // set when a fatal voice error occurs
  const baseTextRef = useRef("");      // text present before this voice session
  const toggleVoiceRef = useRef(null); // always-fresh toggleVoice for setTimeout callers
  const activeCopilotId = useStore((s) => s.activeCopilotId);
  const copilots = useStore((s) => s.copilots);
  const setActiveCopilot = useStore((s) => s.setActiveCopilot);
  const uiLang = useStore((s) => s.language);
  const chatLanguage = useStore((s) => s.chatLanguage);
  const setChatLanguage = useStore((s) => s.setChatLanguage);
  const [voiceLang, setVoiceLang] = useState(chatLanguage || UI_TO_VOICE[uiLang] || "en-US");
  const [langMenu, setLangMenu] = useState(false);
  const [copilotMenu, setCopilotMenu] = useState(false);
  const activeCopilot = copilots.find((c) => c.id === activeCopilotId) || copilots[0];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 220) + "px";
    }
  }, [text]);

  // Insert a draft pushed from another component (e.g. AgentPopup "insert
  // into chat", PromptBuilder "use prompt").
  useEffect(() => {
    if (chatInputDraft) {
      setText((cur) => (cur ? cur + "\n\n" + chatInputDraft : chatInputDraft));
      setChatInputDraft("");
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = textareaRef.current.value.length;
        }
      });
    }
  }, [chatInputDraft, setChatInputDraft]);

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed || "(image)", images);
    setText("");
    setImages([]);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = (files) => {
    const remaining = MAX_IMAGES - images.length;
    const arr = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .filter((f) => {
        // Check the FILE size (not the base64 data URL) against the cap so
        // images near the limit aren't silently dropped.
        if (f.size > MAX_IMAGE_BYTES) {
          pushToast({ type: "error", message: `"${f.name}" is too large — max 4 MB per image.` });
          return false;
        }
        return true;
      })
      .slice(0, Math.max(0, remaining));
    if (arr.length === 0) return;
    Promise.all(arr.map(readAsDataURL)).then((dataUrls) => {
      const valid = dataUrls.filter(Boolean);
      setImages((cur) => [...cur, ...valid].slice(0, MAX_IMAGES));
    });
  };

  const onPaste = async (e) => {
    // Images pasted normally (existing behavior).
    const items = e.clipboardData?.items;
    if (items) {
      for (const it of items) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) { e.preventDefault(); addFiles([file]); return; }
        }
      }
    }
    // Normal paste: let the browser insert exactly what the user copied.
    // (An earlier "magic paste" here dumped the whole clip cabinet over the
    // input on every Ctrl+V — replacing fresh user text with stale clipboard
    // content. Cabinet history is still recorded, without hijacking.)
    const text = e.clipboardData?.getData("text/plain");
    if (text && text.trim()) pushClip(text);
  };

  const toggleVoice = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      alert("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new SR();
    rec.continuous = true; // keep listening until the user clicks stop
    rec.interimResults = true; // show words as they are spoken
    rec.lang = voiceLang;
    rec.onresult = (e) => {
      // Build the full transcript from all final results + current interim.
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      finalText = finalText.trim();
      interim = interim.trim();
      baseTextRef.current = baseTextRef.current || "";
      const merged = ((baseTextRef.current ? baseTextRef.current + " " : "") + (finalText || interim)).trim();
      setText(merged);
      if (finalText) baseTextRef.current = merged;
    };
    rec.onend = () => {
      // Chrome stops after silence; restart to keep the session alive until
      // the user explicitly stops (unless an error killed it).
      if (recordingRef.current && !errorRef.current) {
        try { rec.start(); return; } catch { /* already stopped */ }
      }
      setRecording(false);
    };
    rec.onerror = (e) => {
      const msg = VOICE_ERRORS[e.error];
      if (e.error === "no-speech" && recordingRef.current) return; // auto-restart handles this
      if (msg && (msg.en || msg.bn)) {
        pushToast({ type: "error", message: msg.en + " / " + msg.bn });
      }
      errorRef.current = true;
      setRecording(false);
    };
    errorRef.current = false;
    baseTextRef.current = text || "";
    try {
      rec.start();
    } catch (err) {
      pushToast({ type: "error", message: "Could not start voice input: " + String(err?.message || err) });
      return;
    }
    recognitionRef.current = rec;
    recordingRef.current = true;
    setRecording(true);
  };
  toggleVoiceRef.current = toggleVoice;

  return (
    <div className="px-4 pb-4 pt-2">
      <motion.div
        layout
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
        className="rounded-2xl border transition-all"
        style={{
          background: "var(--cb-surface)",
          borderColor: dragOver ? "var(--cb-accent)" : "var(--cb-border)",
          boxShadow: dragOver ? "0 0 0 2px color-mix(in srgb, var(--cb-accent) 24%, transparent)" : "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.18)",
        }}
      >
        <AnimatePresence>
          {images.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="flex gap-2 px-4 pt-3 overflow-hidden"
            >
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt={`upload-${i}`} className="w-14 h-14 object-cover rounded-md border" style={{ borderColor: "var(--cb-border)" }} />
                  <button
                    onClick={() => setImages((cur) => cur.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "#ef4444" }}
                    aria-label="Remove image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-4 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={recording ? "Listening..." : "Type your message — Enter to send, Shift+Enter for newline"}
            rows={1}
            className="cb-focus w-full bg-transparent outline-none resize-none text-sm leading-relaxed placeholder:opacity-60"
            style={{ minHeight: 24, maxHeight: 220 }}
            disabled={disabled && !recording}
          />
        </div>

        <div className="flex items-center px-3 py-2.5 gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="cb-focus w-7 h-7 rounded-md flex items-center justify-center hover:bg-cb-border transition-colors"
            title="Attach image"
            aria-label="Attach image"
          >
            <Paperclip size={15} style={{ color: "var(--cb-muted)" }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="relative">
            <button
              onClick={() => setCopilotMenu(!copilotMenu)}
              className="cb-focus px-2 py-1 rounded-md text-xs flex items-center gap-1.5 hover:bg-cb-border transition-colors"
              style={{ color: "var(--cb-muted)" }}
              title="Switch copilot"
            >
              <span>{activeCopilot?.icon || "🤖"}</span>
              <span className="hidden sm:inline">{activeCopilot?.name || "Assistant"}</span>
              <ChevronDown size={11} />
            </button>
            <AnimatePresence>
              {copilotMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full mb-1.5 left-0 w-56 rounded-lg shadow-xl py-1 z-30 max-h-64 overflow-y-auto"
                  style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
                >
                  {copilots.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveCopilot(c.id); setCopilotMenu(false); }}
                      className="cb-focus w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-cb-surface transition-colors"
                      style={{ background: c.id === activeCopilotId ? "var(--cb-surface)" : "transparent" }}
                    >
                      <span>{c.icon}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.id === activeCopilotId && <span style={{ color: "var(--cb-accent)" }}>✓</span>}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Web search toggle (ChatGPT-style) */}
          <button
            onClick={onToggleWebSearch}
            className="cb-focus w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0"
            style={{
              background: webSearch ? "var(--cb-accent)" : "transparent",
              color: webSearch ? "white" : "var(--cb-muted)",
            }}
            title={webSearch ? "Web search ON — answers will use live internet results" : "Search the web for up-to-date answers"}
            aria-label="Web search"
            aria-pressed={!!webSearch}
          >
            <Globe size={15} />
          </button>
          {/* Voice input + language selector */}
          <div className="relative flex items-center gap-0.5">
            <button
              onClick={toggleVoice}
              className="cb-focus w-7 h-7 rounded-md flex items-center justify-center transition-colors relative"
              style={{
                background: recording ? "var(--cb-accent)" : "transparent",
                color: recording ? "white" : "var(--cb-muted)",
              }}
              title={recording ? "Stop recording" : `Voice input (${voiceLang})`}
              aria-label="Voice input"
              aria-pressed={recording}
            >
              {recording ? (
                <>
                  {/* live pulse rings while listening */}
                  <motion.span
                    className="absolute inset-0 rounded-md"
                    style={{ border: "1px solid var(--cb-accent)" }}
                    animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
                  />
                  <Square size={12} fill="currentColor" />
                </>
              ) : (
                <Mic size={15} />
              )}
            </button>
            <button
              onClick={() => setLangMenu(!langMenu)}
              className="cb-focus h-7 px-1 rounded-md text-[10px] font-medium transition-colors"
              style={{ color: langMenu ? "var(--cb-accent)" : "var(--cb-muted)" }}
              title="Voice language"
              aria-label="Voice language"
            >
              {VOICE_LANGS.find((l) => l.code === voiceLang)?.flag || "🌐"}
            </button>
            <AnimatePresence>
              {langMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full mb-1.5 left-0 w-44 rounded-lg shadow-xl py-1 z-30"
                  style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
                >
                  {VOICE_LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setVoiceLang(l.code);
                        setChatLanguage(l.code); // the whole chat now replies in this language
                        setLangMenu(false);
                        pushToast({ type: "success", message: `Chat language: ${l.label} — AI এখন এই ভাষায় উত্তর দেবে।` });
                        // If mid-recording, restart cleanly with the new language.
                        if (recording && recognitionRef.current) {
                          recordingRef.current = false; // stop onend from auto-restarting the old session
                          try { recognitionRef.current.stop(); } catch {}
                          setRecording(false);
                          setTimeout(() => toggleVoiceRef.current?.(), 250);
                        }
                      }}
                      className="cb-focus w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-cb-surface transition-colors"
                      style={{ background: l.code === voiceLang ? "var(--cb-surface)" : "transparent" }}
                    >
                      <span>{l.flag}</span>
                      <span className="flex-1">{l.label}</span>
                      {l.code === voiceLang && <span style={{ color: "var(--cb-accent)" }}>✓</span>}
                    </button>
                  ))}
                  <div className="px-3 py-1 text-[9px] border-t" style={{ borderColor: "var(--cb-border)", color: "var(--cb-muted)" }}>
                    নির্বাচিত ভাষায় AI উত্তর দেবে + ভয়েস চিনবে
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <ModelSelector />
            {busy ? (
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                whileTap={{ scale: 0.92 }}
                onClick={stop}
                className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
                aria-label="Stop generating"
              >
                <Square size={12} fill="currentColor" style={{ color: "var(--cb-text)" }} />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                onClick={submit}
                disabled={(!text.trim() && images.length === 0) || disabled}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 shadow-sm"
                style={{ background: "var(--cb-accent)" }}
                aria-label="Send message"
              >
                <ArrowUp size={16} className="text-white" />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
      <div className="text-center text-[11px] mt-2" style={{ color: "var(--cb-muted)" }}>
        AI-generated content may be inaccurate. Please verify important information.
      </div>
    </div>
  );
}

function readAsDataURL(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

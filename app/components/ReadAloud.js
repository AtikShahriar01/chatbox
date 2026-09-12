"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { motion } from "motion/react";

// Detect the language of an AI reply from its script so the read-aloud
// voice matches what was actually written (English output → native-sounding
// English voice, Bangla output → Bangla voice, Arabic → Arabic, etc.).
function detectLang(text) {
  const t = (text || "").slice(0, 400);
  if (/[\u0980-\u09FF]/.test(t)) return "bn-BD"; // Bengali script
  if (/[\u0600-\u06FF]/.test(t)) return "ar-SA"; // Arabic script
  if (/[\u4E00-\u9FFF]/.test(t)) return "zh-CN"; // Han
  if (/[\u0900-\u097F]/.test(t)) return "hi-IN"; // Devanagari
  if (/[\u3040-\u30FF]/.test(t)) return "ja-JP"; // Kana
  if (/[\uAC00-\uD7AF]/.test(t)) return "ko-KR"; // Hangul
  // Latin: distinguish a few common languages by diacritics/markers.
  if (/[àâçéèêëîïôùûüÿœ]/i.test(t)) return "fr-FR";
  if (/[ñáéíóú¿¡]/i.test(t)) return "es-ES";
  return "en-US";
}

// Pick the best professional-sounding voice for a language from the ones
// installed on this system: prefer "Natural"/"Premium"/"Enhanced" voices
// (Windows/Edge online voices), else any native voice for that language.
function pickVoice(lang, voices) {
  const sameLang = voices.filter((v) => v.lang?.replace("_", "-").toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (sameLang.length === 0) return null;
  const premium = sameLang.find((v) => /natural|premium|enhanced|neural/i.test(v.name));
  return premium || sameLang[0];
}

export default function ReadAloud({ message }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const supportedRef = useRef(true);
  const voicesRef = useRef([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      supportedRef.current = false;
      return;
    }
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported || message?.role !== "assistant" || !message?.content) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    // Strip markdown so code fences/symbols aren't read out loud.
    const clean = (message.content || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/[*_#>|\[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    if (!clean) return;

    const utter = new SpeechSynthesisUtterance(clean);
    const lang = detectLang(message.content);
    utter.lang = lang;
    const voice = pickVoice(lang, voicesRef.current);
    if (voice) utter.voice = voice;
    // Professional narration: measured pace, confident pitch.
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utter);
    setSpeaking(true);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={speak}
      className="cb-focus p-1 rounded transition-colors"
      style={{
        color: speaking ? "var(--cb-accent)" : "var(--cb-muted)",
        background: speaking ? "color-mix(in srgb, var(--cb-accent) 12%, transparent)" : "transparent",
      }}
      title={speaking ? "বন্ধ করুন / Stop reading" : `এই উত্তরটি পড়ে শোনাও (${detectLang(message.content)})`}
      aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
      aria-pressed={speaking}
    >
      {speaking ? (
        <span className="flex items-center gap-1">
          {/* equalizer bars while narrating */}
          <motion.span animate={{ scaleY: [1, 1.6, 0.7, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
            style={{ display: "inline-block", width: 2.5, height: 9, background: "var(--cb-accent)", borderRadius: 2, transformOrigin: "bottom" }} />
          <motion.span animate={{ scaleY: [1.3, 0.8, 1.5, 1] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.1 }}
            style={{ display: "inline-block", width: 2.5, height: 9, background: "var(--cb-accent)", borderRadius: 2, transformOrigin: "bottom" }} />
          <motion.span animate={{ scaleY: [0.9, 1.5, 1, 1.4, 0.9] }} transition={{ duration: 1.1, repeat: Infinity, delay: 0.2 }}
            style={{ display: "inline-block", width: 2.5, height: 9, background: "var(--cb-accent)", borderRadius: 2, transformOrigin: "bottom" }} />
        </span>
      ) : (
        <Volume2 size={14} />
      )}
    </motion.button>
  );
}

"use client";

import { useStore } from "@/lib/store";
import { lookupPrice, computeCost, computeUsageValue, formatCostDual, formatUSDT, formatValueBDT } from "@/lib/pricing";
import { formatTokenCount, estimateTokens } from "@/lib/tokenizer";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Brain, Cpu, Coins, Zap, Eye } from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";

// Color tokens per tier (used in chip and bar)
const TIER_COLORS = {
  free:    { bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.30)",  text: "#22c55e", bar: "#22c55e", label: "FREE" },
  cheap:   { bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.30)",  text: "#3b82f6", bar: "#3b82f6", label: "CHEAP" },
  mid:     { bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.30)",  text: "#f59e0b", bar: "#f59e0b", label: "MID" },
  premium: { bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.30)",   text: "#ef4444", bar: "#ef4444", label: "PRO" },
  unknown: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)",  text: "#94a3b8", bar: "#94a3b8", label: "AUTO" },
};

function formatRate(p) {
  if (!p) return null;
  if (p.input === 0) return "Free";
  if (p.input < 0.01) return `$${p.input.toFixed(4)}/M`;
  if (p.input < 1) return `$${p.input.toFixed(3)}/M`;
  return `$${p.input.toFixed(2)}/M`;
}

export default function TokenBadge({ usage, model, streaming = false, modelPricing = {}, estimated = false, text, reasoningText, estPromptTokens = 0 }) {
  const fxRate = useStore((s) => s.fxRateBDT);
  const primary = useStore((s) => s.costPrimary);
  const internalRates = useStore((s) => s.internalRates);

  const price = useMemo(() => lookupPrice(model, modelPricing), [model, modelPricing]);
  const tier = price?.tier || "unknown";
  const colors = TIER_COLORS[tier];

  // When the provider doesn't return usage, estimate tokens from the text so
  // every message still gets a live badge (marked with ~).
  const estCompletion = useMemo(
    () => estimateTokens(text || "") + estimateTokens(reasoningText || ""),
    [text, reasoningText]
  );
  const hasRealUsage = !!(usage && (usage.promptTokens || usage.prompt_tokens || usage.completionTokens || usage.completion_tokens));
  const effective = hasRealUsage
    ? usage
    : { promptTokens: estPromptTokens || 0, completionTokens: estCompletion };
  const isEstimated = estimated || !hasRealUsage;

  // Aggregate counts
  const prompt = effective?.promptTokens || effective?.prompt_tokens || 0;
  const completion = effective?.completionTokens || effective?.completion_tokens || 0;
  const reasoning = usage?.reasoningTokens || usage?.completion_tokens_details?.reasoning_tokens || 0;
  const cached = usage?.cachedTokens || usage?.prompt_tokens_details?.cached_tokens || 0;

  // Streaming deltas (use last-known as displayed value)
  const total = prompt + completion;
  const costUSD = useMemo(
    () => computeCost(model, { promptTokens: prompt, completionTokens: completion }, modelPricing),
    [model, prompt, completion, modelPricing]
  );
  const costStr = formatCostDual(costUSD, fxRate, primary);

  // Internal Usage Value — ৳ reference from configurable internal rates.
  const { bdt: valueBDT, usdt: valueUSDT } = useMemo(
    () => computeUsageValue({ promptTokens: prompt, completionTokens: completion }, internalRates),
    [prompt, completion, internalRates]
  );

  // Bar widths (relative)
  const promptPct = total > 0 ? (prompt / Math.max(total, 1)) * 100 : 0;
  const completionPct = total > 0 ? (completion / Math.max(total, 1)) * 100 : 0;
  const reasoningPct = completion > 0 ? (reasoning / Math.max(completion, 1)) * 100 : 0;

  if (!usage && !streaming && total === 0) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="mt-2 inline-flex flex-wrap items-center gap-1.5"
    >
      {/* Tier badge */}
      {price && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
          }}
          title={`Tier: ${colors.label} · Input ${formatRate(price)} · Output $${price.output.toFixed(2)}/M`}
        >
          {tier === "free" ? <Sparkles size={9} /> : tier === "premium" ? <Zap size={9} /> : <Coins size={9} />}
          {colors.label}
        </span>
      )}

      {/* Token counts (input / output) — count up in real time */}
      <TokenChip
        icon={Cpu}
        label="in"
        value={<AnimatedNumber value={prompt} />}
        color="#3b82f6"
        sub={cached > 0 ? `cached ${formatTokenCount(cached)}` : null}
        rawValue={prompt}
      />
      <TokenChip
        icon={Brain}
        label="out"
        value={<AnimatedNumber value={completion} />}
        color="#a855f7"
        sub={reasoning > 0 ? `think ${formatTokenCount(reasoning)}` : null}
        rawValue={completion}
      />

      {/* Actual API cost — what the provider really charges ($0.00 for free
          models). Animated count-up. */}
      <AnimatePresence mode="popLayout">
        {costStr && (
          <motion.span
            key="cost"
            initial={{ scale: 0.9, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.18 }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
            style={{
              background: "linear-gradient(135deg, " + colors.bg + ", transparent)",
              border: `1px solid ${colors.border}`,
              color: "var(--cb-text)",
            }}
            title={`Actual API cost (provider charge)${isEstimated ? " — estimated" : ""}`}
          >
            <Coins size={10} style={{ color: colors.text }} className={streaming ? "animate-pulse" : ""} />
            <AnimatedCost costUSD={costUSD} fxRate={fxRate} primary={primary} live={streaming} />
            {isEstimated && (
              <span className="text-[8px] font-sans uppercase tracking-wide" style={{ color: "var(--cb-muted)" }} title="Estimated from text (provider did not report usage)">~</span>
            )}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Usage Value — internal reference value (৳ + USDT), calculated from
          configurable internal rates. Always shown, even for free models. */}
      <AnimatePresence mode="popLayout">
        {total > 0 && (
          <motion.span
            key="value"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.10), transparent)",
              border: "1px solid rgba(168,85,247,0.30)",
              color: "var(--cb-text)",
            }}
            title={`Usage Value — internal reference (৳${internalRates?.inputBDT ?? 100}/1M in · ৳${internalRates?.outputBDT ?? 300}/1M out). NOT the provider charge.`}
          >
            <Sparkles size={10} style={{ color: "#a855f7" }} />
            <AnimatedValue bdt={valueBDT} usdt={valueUSDT} live={streaming} />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Bar chart (compact) */}
      {total > 0 && (
        <div className="flex items-center gap-1 ml-1" title={`Input ${formatTokenCount(prompt)} / Output ${formatTokenCount(completion)}`}>
          <div className="flex h-1.5 rounded-full overflow-hidden" style={{ width: 80, background: "var(--cb-border)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${promptPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ background: "#3b82f6" }}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
              style={{ background: "#a855f7" }}
            />
          </div>
          {reasoningPct > 5 && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#ec4899" }}
              title={`${reasoningPct.toFixed(0)}% reasoning tokens`}
            />
          )}
          {cached > 0 && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#06b6d4" }}
              title={`${cached} cached tokens`}
            />
          )}
        </div>
      )}

      {/* Streaming shimmer */}
      {streaming && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--cb-accent)" }}
          title="Streaming…"
        />
      )}
    </motion.div>
  );
}

function TokenChip({ icon: Icon, label, value, color, sub, rawValue }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        color: "var(--cb-text)",
      }}
      title={sub ? `${label}: ${rawValue} (${sub})` : `${label}: ${rawValue}`}
    >
      <Icon size={9} style={{ color }} />
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </span>
  );
}

// Animated Usage Value chip: ৳ count-up + USDT, live during streaming.
function AnimatedValue({ bdt, usdt, live = false }) {
  const prevRef = useRef(0);
  const target = bdt || 0;
  const prev = prevRef.current;
  useEffect(() => {
    prevRef.current = target;
  }, [target]);

  const [display, setDisplay] = useState(prev);
  useEffect(() => {
    if (target === display) return;
    let raf = 0;
    const start = performance.now();
    const from = display;
    const dur = 500;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const bdtStr = formatValueBDT(display);
  const usdtStr = formatUSDT((usdt || 0) * (target ? display / target : 1));
  return (
    <motion.span
      initial={live ? { y: -2, opacity: 0.7 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      {bdtStr} <span style={{ color: "#a855f7" }}>· {usdtStr}</span>
    </motion.span>
  );
}

// Generic animated number: ticks up from its previous value to the new one,
// so during streaming the token counts visibly climb.
function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (value === display) return;
    let raf = 0;
    const start = performance.now();
    const from = display;
    const dur = 400;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{formatTokenCount(Math.round(display))}</>;
}

// Animated dual-currency cost chip. The number count-ups from its previous
// value to the new one, so during streaming the cost visibly ticks up.
function AnimatedCost({ costUSD, fxRate, primary, live = false }) {
  const prevRef = useRef(0);
  const target = costUSD || 0;
  const prev = prevRef.current;
  useEffect(() => {
    prevRef.current = target;
  }, [target]);

  const [display, setDisplay] = useState(prev);
  useEffect(() => {
    if (target === display) return;
    let raf = 0;
    const start = performance.now();
    const from = display;
    const dur = 500;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      // easeOutCubic for a satisfying settle
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const str = formatCostDual(display, fxRate, primary);
  return (
    <motion.span
      key={str}
      initial={live ? { y: -2, opacity: 0.7 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      {str}
    </motion.span>
  );
}

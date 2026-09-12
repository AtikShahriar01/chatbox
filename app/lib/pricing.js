// Pricing helper. Reads from lib/pricing.default.json and a user-override
// `modelPricing` map stored in zustand. Supports USD + BDT display.

import defaults from "./pricing.default.json";

// Normalize: "gpt-4o" and "openai/gpt-4o" should both match.
const flat = (() => {
  const out = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
    if (k.includes("/")) {
      const tail = k.split("/").slice(1).join("/");
      if (tail && !out[tail]) out[tail] = v;
    }
  }
  return out;
})();

function tierFor(price) {
  if (price == null) return null;
  if (price.input === 0) return "free";
  if (price.input < 1) return "cheap";
  if (price.input < 10) return "mid";
  return "premium";
}

export function lookupPrice(modelId, userOverrides = {}) {
  if (!modelId) return null;
  const ov = userOverrides?.[modelId];
  if (ov && (ov.input != null || ov.output != null)) {
    return { input: ov.input ?? 0, output: ov.output ?? 0, tier: ov.tier || tierFor(ov) };
  }
  if (ov && ov.input === 0) return { input: 0, output: 0, tier: "free" };
  const hit = flat[modelId] || flat[modelId.split("/").slice(1).join("/")];
  if (!hit) return null;
  return { input: hit.input ?? 0, output: hit.output ?? 0, tier: hit.tier || tierFor(hit) };
}

export function computeCost(modelId, usage, userOverrides = {}) {
  if (!usage) return null;
  const price = lookupPrice(modelId, userOverrides);
  if (!price) return null;
  const inputTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const outputTokens = usage.completionTokens || usage.completion_tokens || 0;
  const costUSD = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return costUSD;
}

// ---------------------------------------------------------------------------
// Internal Usage Value — a REFERENCE value in BDT, calculated from the
// admin-configurable internal token rates. It is NOT the provider's charge:
// free models have Actual API Cost $0.00 while their Usage Value is > ৳0.
// ---------------------------------------------------------------------------

// Internal reference pricing (BDT per 1M tokens). Defaults follow the spec
// example: 1M input = ৳100, 1M output = ৳300. Configurable from Settings →
// Token Usage → Usage Value Config; stored in the zustand store (this app's
// config layer — it is local-first with no server DB).
export const DEFAULT_INTERNAL_RATES = {
  inputBDT: 100,   // ৳ per 1M input tokens
  outputBDT: 300,   // ৳ per 1M output tokens
  usdtPerBDT: 0.0085, // 1 BDT ≈ 0.0085 USDT (৳117.6 ≈ 1 USDT). Configurable.
};

// Compute the internal usage value for a token usage record. Returns
// { bdt, usdt } where bdt is unrounded (round only for display).
export function computeUsageValue(usage, rates = DEFAULT_INTERNAL_RATES) {
  if (!usage) return { bdt: 0, usdt: 0 };
  const r = { ...DEFAULT_INTERNAL_RATES, ...rates };
  const inputTokens = usage.promptTokens || usage.prompt_tokens || 0;
  const outputTokens = usage.completionTokens || usage.completion_tokens || 0;
  const cached = usage.cachedTokens || usage.prompt_tokens_details?.cached_tokens || 0;
  // Cached input tokens count at the input rate (a conservative reference
  // value: the provider may not charge for them, but they were still tokens).
  const effectiveInput = inputTokens;
  const bdt = (effectiveInput * r.inputBDT + outputTokens * r.outputBDT) / 1_000_000;
  const usdt = bdt * r.usdtPerBDT;
  return { bdt, usdt };
}

// One-shot record: everything needed so a usage record stays historically
// accurate even after rates/prices change later (spec §8). Store this
// snapshot alongside each recorded transaction.
export function buildUsageRecord({ modelId, usage, userOverrides = {}, rates = DEFAULT_INTERNAL_RATES }) {
  const price = lookupPrice(modelId, userOverrides);
  const actualUSD = computeCost(modelId, usage, userOverrides) || 0;
  const { bdt, usdt } = computeUsageValue(usage, rates);
  const inputTokens = usage?.promptTokens || usage?.prompt_tokens || 0;
  const outputTokens = usage?.completionTokens || usage?.completion_tokens || 0;
  const reasoningTokens = usage?.reasoningTokens || usage?.completion_tokens_details?.reasoning_tokens || 0;
  const cachedTokens = usage?.cachedTokens || usage?.prompt_tokens_details?.cached_tokens || 0;
  return {
    provider: modelId?.split("/")[0] || "unknown",
    model: modelId || "unknown",
    inputTokens, outputTokens, cachedTokens, reasoningTokens,
    totalTokens: inputTokens + outputTokens,
    isFree: !price || price.input === 0,
    // Actual provider charge (USD) — 0 for free models.
    actualCostUSD: actualUSD,
    // Internal reference value — always calculated, even for free models.
    usageValueBDT: bdt,
    usageValueUSDT: usdt,
    // Snapshot of the rates used, so history never changes silently.
    internalRates: { ...DEFAULT_INTERNAL_RATES, ...rates },
    pricedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting — Usage Value is displayed separately from API cost.
// ---------------------------------------------------------------------------

export function formatUSDT(usdt) {
  if (usdt == null || isNaN(usdt)) return null;
  if (usdt === 0) return "0 USDT";
  if (usdt < 0.0001) return `${usdt.toFixed(8)} USDT`;
  if (usdt < 1) return `${usdt.toFixed(4)} USDT`;
  return `${usdt.toFixed(2)} USDT`;
}

export function formatValueBDT(bdt) {
  if (bdt == null || isNaN(bdt)) return null;
  if (bdt === 0) return "৳0.00";
  if (bdt < 0.01) return `৳${bdt.toFixed(4)}`;
  if (bdt < 1000) return `৳${bdt.toFixed(2)}`;
  return `৳${(bdt / 1000).toFixed(2)}K`;
}

export function computeUsageBreakdown(usage) {
  if (!usage) return null;
  return {
    prompt: usage.promptTokens || usage.prompt_tokens || 0,
    completion: usage.completionTokens || usage.completion_tokens || 0,
    reasoning: usage.reasoningTokens || usage.completion_tokens_details?.reasoning_tokens || 0,
    cached: usage.cachedTokens || usage.prompt_tokens_details?.cached_tokens || 0,
    audio: usage.audioTokens || usage.prompt_tokens_details?.audio_tokens || 0,
  };
}

// USD formatting
export function formatCost(usd) {
  if (usd == null || isNaN(usd)) return null;
  if (usd === 0) return "$0.0000";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

// BDT-only formatting (Taka)
export function formatBDT(usd, fxRate = 110) {
  if (usd == null || isNaN(usd)) return null;
  const bdt = usd * fxRate;
  if (bdt === 0) return "৳0.00";
  if (bdt < 0.01) return "৳<0.01";
  if (bdt < 1) return `৳${bdt.toFixed(2)}`;
  if (bdt < 1000) return `৳${bdt.toFixed(1)}`;
  if (bdt < 100000) return `৳${(bdt / 1000).toFixed(2)}K`;
  return `৳${(bdt / 1000).toFixed(1)}K`;
}

// Dual-currency formatting: USD primary + BDT secondary, or vice versa.
// Always shows both amounts — even for free models (৳0.00 ($0.0000)); the tier
// badge already communicates "free", so the numbers stay informative.
export function formatCostDual(usd, fxRate = 110, primary = "bdt") {
  if (usd == null || isNaN(usd)) return null;
  const usdStr = formatCost(usd);
  const bdtStr = formatBDT(usd, fxRate);
  if (primary === "bdt") return `${bdtStr} (${usdStr})`;
  return `${usdStr} (${bdtStr})`;
}

export function estimateCost(modelId, inputTokens, outputTokens, userOverrides = {}) {
  return computeCost(modelId, { promptTokens: inputTokens, completionTokens: outputTokens }, userOverrides);
}

export { tierFor };

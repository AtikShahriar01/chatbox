// Lightweight token estimator. 1 token ≈ 4 chars in English. Not perfect
// (no BPE, no CJK handling) but good enough for context-window UX.

export function estimateTokens(text) {
  if (!text) return 0;
  // For CJK, average is closer to 1.5 chars/token; for English, ~4.
  // We mix: 0.6 English-weighted + 0.4 CJK-weighted based on char distribution.
  const cjkCount = (text.match(/[一-鿿]/g) || []).length;
  const otherCount = text.length - cjkCount;
  return Math.ceil(otherCount / 4 + cjkCount / 1.5);
}

export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") total += estimateTokens(m.content);
    else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.text) total += estimateTokens(part.text);
      }
    }
    total += 4; // role overhead
  }
  return total;
}

export function formatTokenCount(n) {
  if (n == null) return "0";
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "K";
  if (n < 1_000_000) return Math.round(n / 1000) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

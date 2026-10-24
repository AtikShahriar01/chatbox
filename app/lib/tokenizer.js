// Lightweight token estimator. Not BPE — a per-script chars/token model:
// CJK ≈ 1.5 chars/token, Bengali/Indic ≈ 2, Arabic ≈ 2, Latin/English ≈ 4.
// Good enough for context-window UX; the Bengali ratio matters most because
// prompts and replies in this app are Bengali-heavy.

export function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length; // kana + Han
  const indic = (text.match(/[\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0b00-\u0b7f\u0c00-\u0c7f\u0d00-\u0d7f]/g) || []).length; // Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil-Telugu-Kannada-Malayalam blocks
  const arabic = (text.match(/[\u0600-\u06ff\u0750-\u077f]/g) || []).length;
  const complexCount = cjk + indic + arabic;
  const otherCount = text.length - complexCount;
  return Math.ceil(otherCount / 4 + cjk / 1.5 + indic / 2 + arabic / 2);
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

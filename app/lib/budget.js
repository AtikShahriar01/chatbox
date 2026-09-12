// Budget state helpers. The store keeps a `budget` object:
//   { monthly: number | null, spent: number, resetAt: ISOString, overageAllowed: boolean }
// The API route can be wired to a hard-stop, but for v1 we soft-track client-side
// and show toasts at 80% / 100% thresholds.

const DEFAULT_BUDGET = { monthly: null, spent: 0, resetAt: null, overageAllowed: false };

export function getBudgetState(budget) {
  const b = { ...DEFAULT_BUDGET, ...(budget || {}) };
  // Compute current month's reset date if not set
  if (!b.resetAt) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    b.resetAt = next.toISOString();
  }
  const cap = b.monthly || 0;
  const spent = b.spent || 0;
  const pct = cap > 0 ? (spent / cap) * 100 : 0;
  const remaining = Math.max(0, cap - spent);
  return {
    ...b,
    cap,
    pct: Math.min(100, pct),
    remaining,
    status: cap === 0 ? "unlimited" : pct >= 100 ? "exceeded" : pct >= 80 ? "warning" : "ok",
  };
}

export function daysUntilReset(resetAt) {
  if (!resetAt) return 0;
  const ms = new Date(resetAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function shouldWarn(pct) {
  if (pct >= 100) return { level: "exceeded", color: "#ef4444", icon: "alert" };
  if (pct >= 80) return { level: "warning", color: "#f59e0b", icon: "warn" };
  return null;
}

"use client";

import { useStore } from "@/lib/store";
import { formatCost, formatBDT, formatUSDT, formatValueBDT, lookupPrice, tierFor, computeUsageValue } from "@/lib/pricing";
import { formatTokenCount } from "@/lib/tokenizer";
import { motion } from "motion/react";
import { Activity, Coins, RotateCcw, TrendingUp, Zap, Brain, Cpu, Eye, Download, Wallet, CalendarDays, Sparkles, SlidersHorizontal } from "lucide-react";

const TIER_COLORS = {
  free: "#22c55e",
  cheap: "#3b82f6",
  mid: "#f59e0b",
  premium: "#ef4444",
  unknown: "#94a3b8",
};

export default function TokenUsage() {
  const monthlyUsage = useStore((s) => s.monthlyUsage);
  const todayUsage = useStore((s) => s.todayUsage);
  const fxRate = useStore((s) => s.fxRateBDT);
  const monthlyBudgetUSD = useStore((s) => s.monthlyBudgetUSD);
  const setSetting = useStore((s) => s.setSetting);
  const resetUsage = useStore((s) => s.resetUsage);
  const pushToast = useStore((s) => s.pushToast);
  const chats = useStore((s) => s.chats);
  const internalRates = useStore((s) => s.internalRates) || { inputBDT: 100, outputBDT: 300, usdtPerBDT: 0.0085 };
  const setInternalRate = useStore((s) => s.setInternalRate);

  const totalTokens = (monthlyUsage.promptTokens || 0) + (monthlyUsage.completionTokens || 0);
  const budgetPct = monthlyBudgetUSD ? Math.min(100, (monthlyUsage.costUSD / monthlyBudgetUSD) * 100) : 0;
  const budgetColor = budgetPct >= 100 ? "#ef4444" : budgetPct >= 80 ? "#f59e0b" : "#22c55e";

  // Last 14 days bar chart data
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const entry = monthlyUsage.byDay?.[d];
    days.push({ date: d, costUSD: entry?.costUSD || 0, requests: entry?.requests || 0 });
  }
  const maxDayCost = Math.max(...days.map((d) => d.costUSD), 0.0001);

  // Per-model sorted by cost
  const byModel = Object.entries(monthlyUsage.byModel || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.costUSD || 0) - (a.costUSD || 0) || b.requests - a.requests);
  const maxModelCost = Math.max(...byModel.map((m) => m.costUSD || 0), 0.0001);

  const exportCSV = () => {
    const rows = [["model", "requests", "prompt_tokens", "completion_tokens", "actual_cost_usd", "actual_cost_bdt", "usage_value_bdt", "usage_value_usdt"]];
    for (const m of byModel) {
      rows.push([
        m.id, m.requests, m.promptTokens, m.completionTokens,
        (m.costUSD || 0).toFixed(6), (m.costBDT || 0).toFixed(4),
        (m.valueBDT || 0).toFixed(4), (m.valueUSDT || 0).toFixed(8),
      ]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `token-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({ type: "success", message: "Usage exported as CSV." });
  };

  const hasData = (monthlyUsage.requests || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header stats — colorful gradient cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Wallet size={16} />}
          label="This month"
          value={formatCost(monthlyUsage.costUSD) || "$0"}
          sub={`API cost · ${formatBDT(monthlyUsage.costUSD, fxRate) || "৳0"}`}
          gradient="linear-gradient(135deg, rgba(59,130,246,0.16), rgba(139,92,246,0.10))"
          color="#3b82f6"
        />
        <StatCard
          icon={<CalendarDays size={16} />}
          label="Today"
          value={formatCost(todayUsage.costUSD) || "$0"}
          sub={`API cost · ${todayUsage.requests || 0} req`}
          gradient="linear-gradient(135deg, rgba(34,197,94,0.16), rgba(16,185,129,0.10))"
          color="#22c55e"
        />
        <StatCard
          icon={<Sparkles size={16} />}
          label="Usage value (month)"
          value={formatValueBDT(monthlyUsage.valueBDT || 0)}
          sub={`${formatUSDT(monthlyUsage.valueUSDT || 0) || "0 USDT"} · internal reference`}
          gradient="linear-gradient(135deg, rgba(168,85,247,0.16), rgba(236,72,153,0.10))"
          color="#a855f7"
        />
        <StatCard
          icon={<Activity size={16} />}
          label="Usage value (today)"
          value={formatValueBDT(todayUsage.valueBDT || 0)}
          sub={`${formatUSDT(todayUsage.valueUSDT || 0) || "0 USDT"} · requests ${todayUsage.requests || 0}`}
          gradient="linear-gradient(135deg, rgba(245,158,11,0.16), rgba(244,114,182,0.10))"
          color="#f59e0b"
        />
      </div>

      {/* Usage Value configuration — the internal BDT reference rates.
          These are NOT the provider's charge; free models still get a value. */}
      <div className="rounded-xl p-4" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
        <div className="flex items-center gap-1.5 mb-1">
          <SlidersHorizontal size={14} style={{ color: "#a855f7" }} />
          <span className="text-sm font-medium">Usage Value config</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded ml-1" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>
            internal reference — not the provider charge
          </span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: "var(--cb-muted)" }}>
          ফ্রি মডেলেও এই হিসাবে Usage Value দেখাবে। Actual API Cost ($0.00) থেকে এটা সম্পূর্ণ আলাদা।
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { key: "inputBDT", label: "Input rate", unit: "৳ / 1M tokens", step: 10 },
            { key: "outputBDT", label: "Output rate", unit: "৳ / 1M tokens", step: 10 },
            { key: "usdtPerBDT", label: "1 BDT =", unit: "USDT", step: 0.0001 },
          ].map((f) => (
            <div key={f.key} className="rounded-lg p-2.5" style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}>
              <div className="text-[10px] font-medium mb-1.5" style={{ color: "var(--cb-muted)" }}>{f.label} <span style={{ opacity: 0.7 }}>({f.unit})</span></div>
              <input
                type="number"
                min="0"
                step={f.step}
                value={internalRates[f.key]}
                onChange={(e) => setInternalRate(f.key, parseFloat(e.target.value) || 0)}
                className="cb-focus w-full px-2 py-1 rounded text-xs font-mono outline-none"
                style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2.5 text-[10.5px]" style={{ color: "var(--cb-muted)" }}>
          <Sparkles size={11} style={{ color: "#a855f7" }} />
          <span>
            Example: 10,000 in + 5,000 out → ৳{(((10000 / 1e6) * internalRates.inputBDT) + ((5000 / 1e6) * internalRates.outputBDT)).toFixed(2)} ·{" "}
            {formatUSDT((((10000 / 1e6) * internalRates.inputBDT) + ((5000 / 1e6) * internalRates.outputBDT)) * internalRates.usdtPerBDT)}
          </span>
        </div>
      </div>

      {/* Budget */}
      <div className="rounded-xl p-4" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp size={14} style={{ color: budgetColor }} /> Monthly budget
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="No cap"
              value={monthlyBudgetUSD ?? ""}
              onChange={(e) => setSetting("monthlyBudgetUSD", e.target.value ? parseFloat(e.target.value) : null)}
              className="cb-focus w-24 px-2 py-1 rounded-md text-xs"
              style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
            />
            <span className="text-xs" style={{ color: "var(--cb-muted)" }}>USD</span>
          </div>
        </div>
        {monthlyBudgetUSD ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--cb-border)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${budgetPct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                style={{ background: `linear-gradient(90deg, ${budgetColor}88, ${budgetColor})` }}
              />
            </div>
            <span className="text-xs font-mono font-semibold" style={{ color: budgetColor }}>
              {budgetPct.toFixed(1)}%
            </span>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--cb-muted)" }}>
            Set a cap to get warnings at 80% and 100%.
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[11px]" style={{ color: "var(--cb-muted)" }}>
            1 USD = <input
              type="number"
              min="1"
              value={fxRate}
              onChange={(e) => setSetting("fxRateBDT", parseFloat(e.target.value) || 110)}
              className="cb-focus w-16 px-1.5 py-0.5 rounded text-[11px] inline-block"
              style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
            /> BDT
          </span>
        </div>
      </div>

      {/* 14-day bar chart */}
      <div className="rounded-xl p-4" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
        <div className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Zap size={14} style={{ color: "#f59e0b" }} /> Last 14 days
        </div>
        <div className="flex items-end gap-1 h-24">
          {days.map((d, i) => {
            const h = Math.max(4, (d.costUSD / maxDayCost) * 100);
            const isToday = i === days.length - 1;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${formatCost(d.costUSD) || "$0"} · ${d.requests} requests`}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.4, delay: i * 0.03, ease: "easeOut" }}
                  className="w-full rounded-t"
                  style={{
                    background: isToday
                      ? "linear-gradient(180deg, #3b82f6, #8b5cf6)"
                      : `linear-gradient(180deg, color-mix(in srgb, var(--cb-accent) ${20 + (d.costUSD / maxDayCost) * 60}%, var(--cb-border)) 0%, var(--cb-border) 100%)`,
                    minHeight: 4,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] mt-1.5" style={{ color: "var(--cb-muted)" }}>
          <span>{days[0].date.slice(5)}</span>
          <span>Today</span>
        </div>
      </div>

      {/* Per-model breakdown */}
      <div className="rounded-xl p-4" style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}>
        <div className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <Coins size={14} style={{ color: "#3b82f6" }} /> By model ({byModel.length})
        </div>
        {!hasData || byModel.length === 0 ? (
          <div className="text-sm text-center py-8" style={{ color: "var(--cb-muted)" }}>
            No usage yet. Send a message to start tracking.
          </div>
        ) : (
          <div className="space-y-2">
            {byModel.map((m) => {
              const price = lookupPrice(m.id);
              const tier = price?.tier || tierFor(price) || "unknown";
              const color = TIER_COLORS[tier];
              const pct = ((m.costUSD || 0) / maxModelCost) * 100;
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="font-mono truncate">{m.id}</span>
                      <span
                        className="text-[9px] px-1 rounded font-medium uppercase shrink-0"
                        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
                      >
                        {tier}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--cb-border)" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
                        />
                      </div>
                    </div>
                    <div className="text-[10px] mt-1 flex items-center gap-2" style={{ color: "var(--cb-muted)" }}>
                      <span>{m.requests} req</span>
                      <span>·</span>
                      <span>↑{formatTokenCount(m.promptTokens)} ↓{formatTokenCount(m.completionTokens)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold">{formatCost(m.costUSD) || "Free"}</div>
                    <div className="text-[10px]" style={{ color: "var(--cb-muted)" }}>{formatBDT(m.costUSD, fxRate)}</div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-0.5 justify-end" title="Usage Value — internal reference, not provider charge">
                      <Sparkles size={8} style={{ color: "#a855f7" }} />
                      <span className="font-mono" style={{ color: "#a855f7" }}>{formatValueBDT(m.valueBDT || 0)}</span>
                      <span style={{ color: "var(--cb-muted)" }}>· {formatUSDT(m.valueUSDT || 0) || "0"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={exportCSV}
          disabled={!hasData}
          className="cb-focus px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          style={{ background: "var(--cb-accent)", color: "white" }}
        >
          <Download size={12} /> Export CSV
        </button>
        <button
          onClick={resetUsage}
          disabled={!hasData}
          className="cb-focus px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          style={{ background: "var(--cb-surface)", border: "1px solid var(--cb-border)" }}
        >
          <RotateCcw size={12} /> Reset counters
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, gradient, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl p-3"
      style={{ background: gradient, border: "1px solid var(--cb-border)" }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium mb-1" style={{ color }}>
        {icon} {label}
      </div>
      <div className="text-lg font-semibold font-mono tracking-tight">{value}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--cb-muted)" }}>{sub}</div>
    </motion.div>
  );
}

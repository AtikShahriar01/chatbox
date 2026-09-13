"use client";

// Usage page (spec-5 §USAGE) — the existing TokenUsage dashboard PLUS a
// top banner that always shows today's ৳/USDT value up front (matches the
// chat's TokenBadge so numbers are never "0.00" while chat shows money).

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Coins, Zap, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { useIde } from "@/lib/ide-store";
import dynamic from "next/dynamic";

const TokenUsage = dynamic(() => import("../TokenUsage"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center text-[12px]" style={{ color: "var(--txt-dim)" }}>
      loading usage…
    </div>
  ),
});

export default function UsagePage() {
  const today = useStore((s) => s.todayUsage) || {};
  const monthly = useStore((s) => s.monthlyUsage) || {};
  const setSetting = useStore((s) => s.setSetting);
  const [, force] = useState(0);
  // TokenUsage is dynamically imported and reads the same store — refresh once
  // after mount so the numbers are live even if the store updated mid-render.
  useEffect(() => { const t = setTimeout(() => force((n) => n + 1), 300); return () => clearTimeout(t); }, []);

  const todayTok = (today.promptTokens || 0) + (today.completionTokens || 0);
  const monthTok = (monthly.promptTokens || 0) + (monthly.completionTokens || 0);

  const cards = [
    { icon: Coins, label: "আজকের Usage Value", value: `৳${(today.valueBDT || 0).toFixed(2)}`, sub: `✦ ${(today.valueUSDT || 0).toFixed(4)} USDT`, color: "var(--accent)" },
    { icon: Zap, label: "আজকের টোকেন", value: todayTok.toLocaleString(), sub: `${today.requests || 0} requests`, color: "#f59e0b" },
    { icon: Wallet, label: "এই মাসের Usage Value", value: `৳${(monthly.valueBDT || 0).toFixed(2)}`, sub: `✦ ${(monthly.valueUSDT || 0).toFixed(4)} USDT · $${(monthly.costUSD || 0).toFixed(3)}`, color: "#a855f7" },
    { icon: Coins, label: "মাসের টোকেন", value: monthTok.toLocaleString(), sub: `${monthly.requests || 0} requests`, color: "#22c55e" },
  ];

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-1 text-[17px] font-bold tracking-tight">Usage</h1>
      <p className="mb-4 text-[12px]" style={{ color: "var(--txt-dim)" }}>
        প্রতিটা AI কলের আসল খরচ (USD) ও usage value (৳/USDT) — চ্যাট ও agent tasks দুটোই এখানে গণনা হয়।
      </p>

      {/* ৳/USDT summary banner — same numbers as the chat's TokenBadge */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--panel-bg)", boxShadow: "var(--shadow-1)" }}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--txt-faint)" }}>
              <c.icon size={12} style={{ color: c.color }} /> {c.label}
            </div>
            <p className="text-[17px] font-bold tracking-tight">{c.value}</p>
            <p className="text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{c.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      <TokenUsage />

      {/* ── Advanced cost (directive §8): provider-wise + daily + budget/local ── */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <h2 className="mb-2 text-[13px] font-semibold">🧮 Provider-wise cost (monthly)</h2>
          {Object.keys(monthly.byProvider || {}).length === 0 && <p className="text-[12px]" style={{ color: "var(--txt-dim)" }}>এখনো provider-wise ডেটা নেই।</p>}
          <div className="space-y-1.5">
            {Object.entries(monthly.byProvider || {}).sort((a, b) => (b[1].costUSD || 0) - (a[1].costUSD || 0)).map(([prov, v]) => {
              const max = Math.max(...Object.values(monthly.byProvider).map((x) => x.costUSD || 0), 0.0001);
              return (
                <div key={prov} className="flex items-center gap-2 text-[12px]">
                  <span className="w-24 truncate" style={{ color: "var(--txt)" }}>{prov}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2, #ffffff12)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, ((v.costUSD || 0) / max) * 100)}%`, background: "var(--accent)" }} />
                  </div>
                  <span className="w-24 text-right font-mono text-[11px]" style={{ color: "var(--txt-dim)" }}>${(v.costUSD || 0).toFixed(3)} · {v.requests} req</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
          <h2 className="mb-2 text-[13px] font-semibold">📅 Daily usage + Budget</h2>
          <DailySpark byDay={monthly.byDay || {}} />
          <div className="mt-3 space-y-2 text-[12px]" style={{ color: "var(--txt-dim)" }}>
            <label className="flex items-center justify-between gap-2">
              <span>💰 Actual API cost</span><span className="font-mono">${(monthly.costUSD || 0).toFixed(4)}</span>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>🖥️ Local compute est.</span><span className="font-mono">${(monthly.localComputeUSD || 0).toFixed(4)}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!(useStore.getState().monthlyBudgetEnforce)} onChange={(e) => setSetting("monthlyBudgetEnforce", e.target.checked)} />
              🔒 Enforce budget (block sending at limit)
            </label>
            <label className="flex items-center gap-2">
              <input
                className="w-24 rounded border bg-transparent px-2 py-1"
                style={{ borderColor: "var(--border)" }}
                type="number" step="0.01" min="0"
                defaultValue={useStore.getState().localCostPerMtok}
                onBlur={(e) => setSetting("localCostPerMtok", Math.max(0, Number(e.target.value) || 0))}
              />
              ⚡ $ / 1M tokens (local compute estimate)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailySpark({ byDay }) {
  const days = Object.keys(byDay).sort().slice(-14);
  const vals = days.map((d) => (byDay[d]?.costUSD || 0) + (byDay[d]?.requests || 0) / 1000);
  const max = Math.max(...vals, 0.001);
  if (!days.length) return <p className="text-[12px]" style={{ color: "var(--txt-dim)" }}>এখনো daily ডেটা নেই।</p>;
  const pts = vals.map((v, i) => `${(i / Math.max(days.length - 1, 1)) * 100},${34 - (v / max) * 30}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-16 w-full">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[10.5px]" style={{ color: "var(--txt-dim)" }}>last {days.length} days · peak ${max.toFixed(3)}</p>
    </div>
  );
}



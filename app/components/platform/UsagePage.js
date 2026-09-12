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
    </div>
  );
}


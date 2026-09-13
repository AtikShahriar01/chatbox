"use client";

// Security page (spec-5 §PERMISSION CENTER / §SECURITY UX) — permission
// center with real state, sensitive action log, emergency stop.

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, ShieldAlert, OctagonX, Lock, Globe, KeyRound, LogOut, Check } from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import { useStore } from "@/lib/store";

// §17 Security Center — live posture (each row reflects a real control we ship).
function usePosture(bridgeConnected) {
  const apiKey = useStore((s) => s.apiKey);
  const sessionKeyOnly = useStore((s) => s.sessionKeyOnly);
  return [
    { label: "API Key", ok: !!apiKey, detail: sessionKeyOnly ? "Session-only (never stored on disk)" : "Stored locally in this browser", note: "BYOK — key goes only to your chosen provider" },
    { label: "PC Bridge", ok: bridgeConnected, detail: bridgeConnected ? "Reachable · token-protected (localhost only)" : "Bridge offline", note: "token never sent to browser" },
    { label: "Workspace", ok: true, detail: "Locked to chosen folder", note: "path confinement + symlink check" },
    { label: "Terminal", ok: true, detail: "Restricted", note: "idle/max-runtime + denylist + output cap" },
    { label: "Session", ok: true, detail: "HttpOnly · SameSite=Strict · HMAC", note: "scrypt PIN · server-side verify" },
    { label: "SSRF Protection", ok: true, detail: "Enabled", note: "metadata + private-IP + redirect-hop blocked" },
    { label: "Audit Log", ok: true, detail: "Enabled · structured", note: "every action logged (JSONL)" },
  ];
}

const PERMS = [
  { label: "Workspace Read", scope: "workspace-only", risk: "low", desc: "confine() সব read op কে workspace-এর ভেতরে আটকে দেয়; agent-bridge zone blocked" },
  { label: "Workspace Write", scope: "workspace-only", risk: "medium", desc: "write/edit/mkdir — ask/safe mode-এ approval লাগে" },
  { label: "File Delete", scope: "workspace-only", risk: "high", desc: "delete/move — সবসময় audited; safe mode-এ approval" },
  { label: "Terminal", scope: "workspace cwd", risk: "high", desc: "exec denylist (SSH keys, credential stores, LSASS) + redaction" },
  { label: "Network", scope: "provider calls", risk: "medium", desc: "AI provider + localhost bridge; কোনো secret বাইরে যায় না" },
  { label: "Browser", scope: "—", risk: "info", desc: "এই রিলিজে disabled (Phase-2 spec) — UI-তে কোনো browser control নেই" },
  { label: "Computer Control", scope: "—", risk: "info", desc: "এই রিলিজে disabled — কোনো mouse/screen control নেই" },
  { label: "Git Write", scope: "workspace repo", risk: "medium", desc: "stage/commit/branch via arg-array git (no shell quoting)" },
  { label: "Git Push", scope: "explicit", risk: "high", desc: "push শুধু user-এর নিজের চালানো কমান্ডে; agent নিজে থেকে push করে না" },
  { label: "Secret Access", scope: "never", risk: "critical", desc: ".env/keys পড়া ব্লকড + সব output redact — agent সিক্রেট দেখতে পায় না" },
];

export default function SecurityPage() {
  const [lines, setLines] = useState([]);
  const [mode, setMode] = useState("ask");
  const [stopped, setStopped] = useState(false);
  const [bridge, setBridge] = useState(false);
  const activity = useIde((s) => s.activity);
  const posture = usePosture(bridge);
  const crit = PERMS.filter((p) => p.risk === "critical").length;
  const hi = PERMS.filter((p) => p.risk === "high").length;
  const med = PERMS.filter((p) => p.risk === "medium").length;
  const prot = posture.filter((p) => p.ok).length;

  const authPost = async (action, extra = {}) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    return r.json().catch(() => ({ ok: r.ok }));
  };
  const logoutAll = async () => { if (!window.confirm("সব session revoke করবেন? অন্য ট্যাব/ডিভাইস থেকে লগআউট হয়ে যাবে।")) return; const r = await authPost("logout-all"); useStore.getState().pushToast({ type: r.ok ? "success" : "error", message: r.ok ? "সব session revoke হয়েছে — আবার লগইন লাগবে" : "ব্যর্থ" }); if (r.ok) setTimeout(() => { location.href = "/login"; }, 800); };
  const changePin = async () => { const old = window.prompt("Current PIN:"); if (old == null) return; const np = window.prompt("New PIN (4-8 digits):"); if (!np) return; const r = await authPost("change-pin", { oldPin: old.trim(), newPin: np.trim() }); useStore.getState().pushToast({ type: r.ok ? "success" : "error", message: r.ok ? "PIN বদলে গেছে · সব পুরনো session revoke হয়েছে" : (r.error || "ব্যর্থ") }); };

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      pc("status").catch(() => null),
      fetch("/api/pc", { method: "POST", headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" }, body: JSON.stringify({ op: "audit", limit: 150 }) }).then((r) => r.json()).catch(() => null),
    ]);
    if (s?.mode) setMode(s.mode);
    setBridge(!!s?.ok);
    setLines((a?.lines || []).slice().reverse().map((l) => { try { const j = JSON.parse(l); return `${new Date(j.t).toLocaleTimeString()} ${j.kind} ${j.detail || ""}${j.extra ? " · " + j.extra : ""}`; } catch { return l; } }));
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);

  const emergencyStop = async () => {
    if (!window.confirm("সব agent প্রসেস ও টার্মিনাল বন্ধ করবেন?")) return;
    const pl = await pc("/proc/list");
    for (const p of (pl?.procs || []).filter((x) => x.status === "running")) await pc("/proc/stop", { id: p.id });
    const tl = await pc("/term/list");
    for (const t of tl?.terms || []) await pc("/term/kill", { id: t.id });
    await pc("/mode", { mode: "ask" });
    setStopped(true);
    setTimeout(() => setStopped(false), 4000);
  };

  const sensitive = activity.filter((a) => /write|delete|exec|stop|rollback|checkpoint|terminal|proc/i.test(a.action)).slice(0, 20);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-[17px] font-bold tracking-tight">Security</h1>
        <span className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--ok) 12%, transparent)", color: "var(--ok)" }}>
          <Lock size={11} /> mode: {mode}
        </span>
      </div>

      {/* §17 Security Center — posture matrix */}
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold"><ShieldCheck size={14} className="text-[var(--accent)]" /> Security Center</h2>
          <span className="ml-auto text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{prot}/{posture.length} protected</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {posture.map((p) => (
            <div key={p.label} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}>
              <span className="mt-0.5 shrink-0">{p.ok ? <Check size={13} className="text-emerald-400" /> : <OctagonX size={13} style={{ color: "var(--err)" }} />}</span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: "var(--txt)" }}>{p.label}: <span style={{ color: p.ok ? "var(--ok)" : "var(--err)" }}>{p.ok ? "Protected" : "Down"}</span></p>
                <p className="text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{p.detail} · {p.note}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb,var(--err) 15%,transparent)", color: "var(--err)" }}>Critical {crit}</span>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb,var(--warn) 15%,transparent)", color: "var(--warn)" }}>High {hi}</span>
          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)", color: "var(--accent)" }}>Medium {med}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={changePin} className="cb-focus rounded-lg border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}><KeyRound size={11} className="mr-1 inline" /> Change PIN</button>
            <button onClick={logoutAll} className="cb-focus rounded-lg border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--err)" }}><LogOut size={11} className="mr-1 inline" /> Logout all</button>
          </div>
        </div>
      </section>

      {/* emergency stop */}
      <section className="rounded-2xl border p-4" style={{ borderColor: "color-mix(in srgb, var(--err) 35%, transparent)", background: "color-mix(in srgb, var(--err) 6%, transparent)" }}>
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "var(--err)" }}>
          <OctagonX size={15} /> Emergency stop
        </h2>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--txt-dim)" }}>
          সব agent-started প্রসেস ও টার্মিনাল সাথে সাথে বন্ধ করবে এবং permission mode "ask"-এ নামিয়ে দেবে।
        </p>
        <button onClick={emergencyStop} className="mt-2 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white" style={{ background: "var(--err)" }}>
          STOP EVERYTHING
        </button>
        {stopped && <p className="mt-2 text-[11.5px] font-semibold" style={{ color: "var(--ok)" }}>✓ সব বন্ধ করা হয়েছে — mode এখন ask</p>}
      </section>

      {/* permission center */}
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold"><ShieldCheck size={14} className="text-[var(--accent)]" /> Permission center</h2>
        <div className="space-y-1.5">
          {PERMS.map((p) => {
            const enabled = p.scope !== "—" && p.scope !== "never";
            return (
              <div key={p.label} className="flex items-start gap-2.5 rounded-xl px-3 py-2" style={{ background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}>
                {p.scope === "never" ? <KeyRound size={13} className="mt-0.5" style={{ color: "var(--err)" }} /> : <Globe size={13} className="mt-0.5" style={{ color: "var(--txt-dim)" }} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold">
                    {p.label}
                    <span className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background: `color-mix(in srgb, ${p.risk === "high" || p.risk === "critical" ? "var(--err)" : p.risk === "medium" ? "var(--warn)" : "var(--ok)"} 15%, transparent)`, color: p.risk === "high" || p.risk === "critical" ? "var(--err)" : p.risk === "medium" ? "var(--warn)" : "var(--ok)" }}>
                      {p.risk}
                    </span>
                  </p>
                  <p className="text-[10.5px]" style={{ color: "var(--txt-dim)" }}>{p.desc}</p>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
                  style={{ background: enabled ? "color-mix(in srgb, var(--ok) 14%, transparent)" : "color-mix(in srgb, var(--txt-dim) 15%, transparent)", color: enabled ? "var(--ok)" : "var(--txt-dim)" }}>
                  {enabled ? "ACTIVE" : "OFF"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* sensitive actions + audit */}
      <section className="rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--panel-bg)" }}>
        <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          <ShieldAlert size={13} className="text-[var(--warn)]" />
          <h2 className="text-[12.5px] font-semibold">Bridge audit log (append-only)</h2>
        </header>
        <div className="max-h-80 overflow-auto p-3 font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--txt-dim)" }}>
          {lines.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap ${/DENY|BLOCK/.test(l) ? "font-semibold" : ""}`}
              style={{ color: /DENY|BLOCK/.test(l) ? "var(--err)" : /ALLOW/.test(l) ? "var(--warn)" : undefined }}>
              {l}
            </div>
          ))}
          {!lines.length && <p className="py-4 text-center font-sans">audit log খালি বা ব্রিজ বন্ধ।</p>}
        </div>
      </section>
    </div>
  );
}

"use client";

// Login / Register (spec-5 §AUTH UX) — SERVER-side PIN authentication.
// The PIN never leaves this page except over same-origin POST /api/auth;
// the server verifies it and issues an HttpOnly session cookie. (The old
// localStorage-only flow is replaced — the server is the security boundary.)

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FolderGit2, KeyRound, UserRound, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [registered, setRegistered] = useState(null); // null = checking
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth", { cache: "no-store" });
        const s = await r.json();
        if (s.authenticated) { window.location.href = "/"; return; }
        setRegistered(!!s.registered);
      } catch {
        setErr("সার্ভারে পৌঁছানো যাচ্ছে না — অ্যাপটি চালু আছে কি না দেখুন।");
        setRegistered(false);
      }
    })();
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: registered ? "login" : "register", pin, name: name || "Local User" }),
      });
      const s = await r.json();
      if (s.ok) {
        // full reload (not client navigation) — guarantees the middleware sees
        // the fresh session cookie on the next request.
        window.location.href = "/";
        return;
      }
      setErr(s.error || "ব্যর্থ হয়েছে।");
    } catch {
      setErr("নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  };

  if (registered === null) return <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg)" }} />;

  return (
    <div className="flex h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--panel-bg)", boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #9333ea))" }}>
            <FolderGit2 size={17} color="white" />
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight">Agent Console</p>
            <p className="text-[11px]" style={{ color: "var(--txt-dim)" }}>{registered ? "সাইন ইন করুন" : "প্রথমবার — একাউন্ট তৈরি করুন"}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!registered && (
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--txt-dim)" }}>
                <UserRound size={11} /> নাম (ঐচ্ছিক)
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Local User"
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--txt-dim)" }}>
              <KeyRound size={11} /> PIN (৪–৮ ডিজিট)
            </span>
            <input autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric" type="password" placeholder="••••"
              className="w-full rounded-xl border bg-transparent px-3 py-2 text-[15px] tracking-[0.4em] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }} required />
          </label>

          {err && <p className="rounded-lg px-2.5 py-1.5 text-[11.5px]" style={{ background: "color-mix(in srgb, var(--err) 12%, transparent)", color: "var(--err)" }}>{err}</p>}

          <button type="submit" disabled={busy || pin.length < 4}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}>
            {busy ? "…" : registered ? "Unlock" : "Create account"} <ArrowRight size={13} />
          </button>
        </form>

        <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed" style={{ color: "var(--txt-faint)" }}>
          <ShieldCheck size={11} className="mt-0.5 shrink-0" />
          সার্ভার-সাইড যাচাই: PIN hash (SHA-256 + salt) সার্ভারে থাকে, ব্রাউজারে শুধু
          HttpOnly সেশন কুকি। ৫ বার ভুল হলে ৫ মিনিট লক।
        </p>
        <div className="mt-3 flex justify-between text-[11.5px]">
          <Link href="/" style={{ color: "var(--accent)" }}>← Chat</Link>
        </div>
      </motion.div>
    </div>
  );
}

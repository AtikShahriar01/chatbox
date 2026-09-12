"use client";

// Unified app root — Chat / IDE / Console in ONE shell.
// Views switch instantly via lib/ui-store (no route reloads). IDE and Console
// are lazily mounted on first open and then KEPT MOUNTED (display toggling)
// so the terminal sessions, editor tabs and scroll positions survive switches.

import { useStore } from "@/lib/store";
import { useThemeEffect } from "@/lib/useTheme";
import { useUi } from "@/lib/ui-store";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import SettingsModal from "@/components/SettingsModal";
import CommandPalette from "@/components/CommandPalette";
import Toaster from "@/components/Toaster";
import ErrorBoundary from "@/components/ErrorBoundary";
import PromptBuilderModal from "@/components/PromptBuilderModal";
import dynamic from "next/dynamic";
import { LazyMotion, domAnimation } from "motion/react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import ViewSwitcher from "@/components/platform/ViewSwitcher";
import CodeOutputWindow from "@/components/chat/CodeOutputWindow";
import TodoPanel from "@/components/TodoPanel";

// Heavy views load on first visit only, client-side, with a branded loader.
const IdeLayout = dynamic(() => import("@/components/ide/IdeLayout"), {
  ssr: false,
  loading: () => <ViewLoader label="starting IDE…" />,
});
const PlatformShell = dynamic(() => import("@/components/platform/PlatformShell"), {
  ssr: false,
  loading: () => <ViewLoader label="starting console…" />,
});

function ViewLoader({ label }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: "var(--cb-bg)" }}>
      <div className="flex items-center gap-2" style={{ color: "var(--cb-muted)" }}>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--cb-accent)] border-t-transparent" />
        <span className="text-[13px]">{label}</span>
      </div>
    </div>
  );
}

export default function Home() {
  useThemeEffect();
  const view = useUi((s) => s.view);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const promptBuilderOpen = useStore((s) => s.promptBuilderOpen);
  const setPromptBuilderOpen = useStore((s) => s.setPromptBuilderOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const setActive = useStore((s) => s.setActive);
  const activeChatId = useStore((s) => s.activeChatId);
  const chats = useStore((s) => s.chats);
  const createChat = useStore((s) => s.createChat);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState({ ide: false, console: false });
  const [ready, setReady] = useState(false);

  // Persisted state rehydrates client-side only (skipHydration in the store) —
  // gate view-dependent renders until mount so SSR HTML and the first client
  // render always match.
  useEffect(() => {
    useStore.persist.rehydrate();
    useUi.persist.rehydrate();
    setReady(true);
  }, []);

  // Mount a heavy view the first time it is opened; keep it alive afterwards.
  useEffect(() => {
    if (view === "ide" && !mounted.ide) setMounted((m) => ({ ...m, ide: true }));
    if (view === "console" && !mounted.console) setMounted((m) => ({ ...m, console: true }));
  }, [view, mounted]);

  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (mobileOpen) setMobileOpen(false);
      } else if (isMod && e.key.toLowerCase() === "k" && view === "chat") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (isMod && e.key.toLowerCase() === "n" && view === "chat") {
        e.preventDefault();
        createChat();
      } else if (e.key === "?" && view === "chat" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        setSettingsOpen(true);
        useStore.getState().setSettingsTab("shortcuts");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, settingsOpen, setPaletteOpen, setSettingsOpen, mobileOpen, createChat, view]);

  // Mouse-following spotlight: update --mouse-x/--mouse-y on <html>, rAF-throttled.
  // Skipped entirely when reduce-motion is on (saves constant repaints on weak GPUs).
  useEffect(() => {
    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const root = document.documentElement;
        if (root.getAttribute("data-reduce-motion") === "on") return;
        root.style.setProperty("--mouse-x", `${e.clientX}px`);
        root.style.setProperty("--mouse-y", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <ErrorBoundary>
      <main className="relative h-screen flex overflow-hidden" style={{ background: "var(--cb-bg)" }}>
        {/* ------------------------------------------------ CHAT view ------ */}
        <div
          className="view-fade relative z-10 flex h-full w-full min-h-0"
          style={{ display: !ready || view === "chat" ? "flex" : "none" }}
        >
          <LazyMotion features={domAnimation}>
            <div className="cb-mesh-bg" aria-hidden>
              <div className="blob" />
              <div className="blob-4" />
              <div className="blob-5" />
              <div className="hue" />
              <div className="spotlight" />
            </div>

            <div className="relative z-10 flex h-full w-full min-h-0">
              {/* Desktop sidebar (hidden on mobile) */}
              <div className="hidden md:flex h-full">
                <Sidebar />
              </div>
              {/* Mobile drawer */}
              <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

              <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar on mobile only */}
                <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--cb-border)" }}>
                  <button
                    onClick={() => setMobileOpen(true)}
                    className="cb-focus p-1.5 rounded hover:bg-cb-surface"
                    aria-label="Open sidebar"
                  >
                    <Menu size={18} />
                  </button>
                  <span className="font-semibold tracking-tight truncate">{activeChat?.title || "Chatbox"}</span>
                  <div className="ml-auto">{ready && <ViewSwitcher compact />}</div>
                </div>
                <ChatPanel />
              </div>
            </div>

            <CommandPalette />
            {settingsOpen && <SettingsModal />}
            <PromptBuilderModal open={promptBuilderOpen} onClose={() => setPromptBuilderOpen(false)} />
          </LazyMotion>
        </div>

        {/* ------------------------------------------------ IDE view ------- */}
        {mounted.ide && (
          <div
            className="view-fade absolute inset-0 z-20"
            style={{ display: view === "ide" ? "block" : "none" }}
            aria-hidden={view !== "ide"}
          >
            <IdeLayout />
          </div>
        )}

        {/* ------------------------------------------------ CONSOLE view --- */}
        {mounted.console && (
          <div
            className="view-fade absolute inset-0 z-20"
            style={{ display: view === "console" ? "block" : "none" }}
            aria-hidden={view !== "console"}
          >
            <PlatformShell />
          </div>
        )}

        <Toaster />
        {/* ZCode-style live task checklist — floats top-right in every view */}
        <TodoPanel />
        {/* Floating window: shows code the AI agent writes, syntax-colored */}
        <CodeOutputWindow />
      </main>
    </ErrorBoundary>
  );
}

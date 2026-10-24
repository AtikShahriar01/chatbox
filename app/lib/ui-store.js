"use client";

// Unified view state — Chat / IDE / Console live inside ONE app and switch
// instantly (no route reload). Persisted so the last view reopens.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useUi = create()(
  persist(
    (set) => ({
      view: "chat", // "chat" | "ide" | "console"
      setView: (view) => set({ view }),
      // Console section for deep links (/console/tasks → "tasks"). Transient —
      // read by PlatformShell on mount, kept out of persistence via partialize.
      consoleSection: null,
      setConsoleSection: (s) => set({ consoleSection: s }),
    }),
    {
      name: "chatbox-view",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ view: s.view }),
    }
  )
);

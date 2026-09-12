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
    }),
    { name: "chatbox-view", storage: createJSONStorage(() => localStorage), skipHydration: true }
  )
);

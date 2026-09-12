"use client";

// Agent Output window state — every file the agent writes pops into this
// floating window (syntax-highlighted, per-file tabs) alongside a LIVE log
// of every action it takes on the PC.
//
// streamFile() makes the popup feel like a real coder at work: the file's
// content TYPES itself into the Monaco editor chunk by chunk (visible in the
// Files tab), instead of appearing all at once.

import { create } from "zustand";

export const useCodeWindow = create((set, get) => ({
  open: false,
  minimized: false,
  files: [], // [{ path, content, streaming? }]
  activePath: null,
  log: [], // [{ at, icon, text, kind }] — live agent activity
  _streamTimer: null,
  setOpen: (open) => set({ open, minimized: open ? false : get().minimized }),
  minimize: () => set({ minimized: true }),
  maximize: () => set({ minimized: false }),
  setFiles: (files) => set({ files, open: true, minimized: false, activePath: files[0]?.path ?? null }),
  addFile: (file) => {
    get().stopStream();
    const files = [...get().files.filter((f) => f.path !== file.path), { ...file, streaming: false }];
    set({ files, open: true, minimized: false, activePath: get().activePath || file.path });
  },
  // Types `content` into `path` progressively — like a human writing code.
  // Time-based pacing: short files take ~5-10s (clearly visible), long files
  // cap at ~12s so it never feels stuck.
  streamFile: ({ path, content, active = true }) => {
    get().stopStream();
    const files = [...get().files.filter((f) => f.path !== path), { path, content: "", streaming: true }];
    set({ files, open: true, minimized: false, activePath: active ? path : get().activePath });
    const total = content.length;
    const duration = Math.min(12000, Math.max(4500, total * 14)); // ms
    const tickMs = 40;
    const t0 = Date.now();
    let i = 0;
    const tick = () => {
      if (i >= total) {
        set({ files: get().files.map((f) => (f.path === path ? { ...f, content, streaming: false } : f)) });
        get()._streamTimer = null;
        return;
      }
      // stay on schedule: how much should be typed by now?
      const elapsed = Date.now() - t0;
      const scheduled = Math.min(total, Math.ceil((total * Math.min(1, elapsed / duration))));
      i = Math.min(total, Math.max(i + 1, scheduled + Math.floor(Math.random() * 3)));
      set({ files: get().files.map((f) => (f.path === path ? { ...f, content: content.slice(0, i), streaming: true } : f)) });
      get()._streamTimer = setTimeout(tick, tickMs);
    };
    tick();
  },
  stopStream: () => {
    const t = get()._streamTimer;
    if (t) { clearTimeout(t); get()._streamTimer = null; }
    set({ files: get().files.map((f) => (f.streaming ? { ...f, streaming: false } : f)) });
  },
  clear: () => { get().stopStream(); set({ files: [], activePath: null, log: [] }); },
  addLog: (entry) => {
    const log = [...get().log, { at: new Date().toLocaleTimeString(), icon: "•", kind: "info", text: "", ...entry }].slice(-120);
    set({ log, open: true, minimized: false });
  },
  setActive: (activePath) => set({ activePath }),
}));

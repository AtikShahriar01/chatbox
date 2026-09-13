"use client";

// IDE state: open tabs, dirty buffers, agent tasks, activity feed, panel layout.
// Panel/tab prefs persist in localStorage; file buffers stay in-memory so a
// refresh never leaves stale content behind.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const ACTIVITY_CAP = 300;

const DEFAULT_PANELS = {
  left: true, right: true, bottom: true,
  bottomTab: "terminal", // terminal | problems | output | git | processes | audit
  centerTab: "editor",   // editor | preview | dashboard | search
};

export const useIde = create()(
  persist(
    (set, get) => ({
      // ------------------------------------------------------------ layout --
      panels: { ...DEFAULT_PANELS },
      setPanel: (k, v) => set({ panels: { ...get().panels, [k]: v } }),
      setBottomTab: (t) => set({ panels: { ...get().panels, bottomTab: t, bottom: true } }),
      setCenterTab: (t) => set({ panels: { ...get().panels, centerTab: t } }),

      // ------------------------------------------------------------ bridge --
      bridge: { connected: false, workspace: "", mode: "ask", version: 2 },
      setBridge: (b) => set({ bridge: { ...get().bridge, ...b } }),

      // ------------------------------------------------------- live todo ----
      // The agent's checklist, mirrored for the right-hand panel so it is
      // visible in the CHAT view too (ZCode-style). Cleared when a run ends
      // and the user starts something new.
      liveTodos: [],
      todoTitle: "",
      todoRunning: false,
      setLiveTodos: (todos, title, running = true) => set({ liveTodos: todos, todoTitle: title || "", todoRunning: running }),
      clearLiveTodos: () => set({ liveTodos: [], todoTitle: "", todoRunning: false }),

      // ------------------------------------------------------ explorer tree --
      treeVersion: 0, // bump to tell the explorer to refetch
      refreshTree: () => set({ treeVersion: get().treeVersion + 1 }),

      // -------------------------------------------------------------- tabs --
      tabs: [],            // [{ path, name, content, original, dirty, lang, isDiff }]
      activePath: null,
      openTab: (path, name, content, opts = {}) => {
        const existing = get().tabs.find((t) => t.path === path);
        if (existing) {
          set({
            activePath: path,
            tabs: get().tabs.map((t) =>
              t.path === path && content != null && !t.dirty && !opts.keepBuffer
                ? { ...t, content, original: content }
                : t
            ),
          });
          return;
        }
        const tab = {
          id: newId(), path, name,
          content: content ?? "", original: content ?? "",
          dirty: false, lang: opts.lang || "plaintext",
          isDiff: !!opts.isDiff, aiChange: opts.aiChange || null, // {before, after, reason, taskId}
        };
        set({ tabs: [...get().tabs, tab], activePath: path });
      },
      closeTab: (path) => {
        const tabs = get().tabs.filter((t) => t.path !== path);
        const activePath = get().activePath === path ? (tabs[tabs.length - 1]?.path ?? null) : get().activePath;
        set({ tabs, activePath });
      },
      updateTab: (path, patch) =>
        set({
          tabs: get().tabs.map((t) => (t.path === path ? { ...t, ...patch } : t)),
        }),
      markSaved: (path, content) =>
        set({
          tabs: get().tabs.map((t) =>
            t.path === path ? { ...t, content, original: content, dirty: false } : t
          ),
        }),
      setActive: (path) => set({ activePath: path }),

      // ------------------------------------------------------- ai changes --
      aiChanges: [], // [{ id, path, before, after, reason, taskId, at, status }]
      addAiChange: (c) => set({ aiChanges: [c, ...get().aiChanges].slice(0, 100) }),
      resolveAiChange: (id, status) =>
        set({ aiChanges: get().aiChanges.map((c) => (c.id === id ? { ...c, status } : c)) }),

      // ------------------------------------------------------------ tasks --
      tasks: [], // [{ id, title, status, steps: [{title, status, detail, tools}], error, startedAt, finishedAt, files: [], commands: [] }]
      addTask: (t) => set({ tasks: [t, ...get().tasks].slice(0, 40) }),
      // Persistent agent task history + queue (directive §9). History survives
      // reload (see partialize); queue holds goals not yet run.
      taskHistory: [], // [{ id, title, status, summary, startedAt, finishedAt, files, commands, count }]
      pushTaskHistory: (t) => set((s) => ({
        taskHistory: [{
          id: t.id, title: t.title, status: t.status, summary: t.summary || null,
          startedAt: t.startedAt, finishedAt: t.finishedAt || new Date().toISOString(),
          files: t.files || [], commands: t.commands || [], todos: t.todos || [],
        }, ...s.taskHistory].slice(0, 50),
      })),
      clearTaskHistory: () => set({ taskHistory: [] }),
      taskQueue: [], // queued goal strings
      enqueueTask: (goal) => set((s) => ({ taskQueue: [...s.taskQueue, String(goal).slice(0, 500)] })),
      dequeueTask: () => { const s = get(); const [head, ...rest] = s.taskQueue; set({ taskQueue: rest }); return head || null; },
      updateTask: (id, patch) =>
        set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      updateTaskStep: (taskId, idx, patch) =>
        set({
          tasks: get().tasks.map((t) => {
            if (t.id !== taskId) return t;
            const steps = [...t.steps];
            steps[idx] = { ...steps[idx], ...patch };
            return { ...t, steps };
          }),
        }),
      pushTaskStep: (taskId, step) =>
        set({
          tasks: get().tasks.map((t) =>
            t.id === taskId ? { ...t, steps: [...t.steps, step] } : t
          ),
        }),

      // --------------------------------------------------------- activity --
      activity: [], // [{ id, at, actor, action, resource, result, risk }]
      pushActivity: (a) =>
        set({
          activity: [
            { id: newId(), at: new Date().toISOString(), ...a },
            ...get().activity,
          ].slice(0, ACTIVITY_CAP),
        }),
      clearActivity: () => set({ activity: [] }),

      // -------------------------------------------------------- approvals --
      pendingApprovals: [], // [{ id, kind, summary }]
      setPending: (list) => set({ pendingApprovals: list }),

      // --------------------------------------------------------- terminals --
      terminals: [], // [{ id, label }]
      addTerminal: (id, label) => set({ terminals: [...get().terminals, { id, label }] }),
      removeTerminal: (id) => set({ terminals: get().terminals.filter((t) => t.id !== id) }),
    }),
    {
      name: "chatbox-ide",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ panels: s.panels, taskHistory: (s.taskHistory || []).slice(0, 50), taskQueue: s.taskQueue || [] }), // layout + durable agent task history/queue
    }
  )
);

export const TASK_STATUS = {
  QUEUED: "queued", PLANNING: "planning", RUNNING: "running", WAITING: "waiting",
  TESTING: "testing", FIXING: "fixing", COMPLETED: "completed", FAILED: "failed",
  CANCELLED: "cancelled", PAUSED: "paused",
};

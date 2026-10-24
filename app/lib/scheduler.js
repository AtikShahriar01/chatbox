"use client";

// Time-based automations (ZCode-style scheduler). Schedules live in the
// persisted store; lib ticks every 30s while the app is open and, when a
// schedule is due, dispatches "cb:schedule-run" — ChatPanel starts a fresh
// chat for the prompt. Next-run is stored on the schedule for the UI.

import { useStore } from "@/lib/store";

let started = false;

export function startScheduler() {
  if (started || typeof window === "undefined") return;
  started = true;
  // compute nextRun for anything missing one (first launch / migration)
  tick();
  setInterval(tick, 30_000);
  // Push schedules to the BRIDGE so automations run even when the browser is
  // closed (bridge ticks its own clock against the same schedules.json).
  syncToBridge();
  setInterval(syncToBridge, 5 * 60_000);
  setInterval(autoBackup, 60 * 60_000);
  setTimeout(autoBackup, 20_000);
}

// Mirror enabled schedules (+ BYOK creds, the bridge needs them to run the
// LLM call) into agent-bridge/schedules.json via the authenticated proxy.
async function syncToBridge() {
  try {
    const st = useStore.getState();
    const schedules = (st.schedules || []).filter((sc) => sc.enabled).map((sc) => ({
      id: sc.id, prompt: sc.prompt, kind: sc.kind, everyMinutes: sc.everyMinutes,
      dailyTime: sc.dailyTime, lastRun: sc.lastRun || null, nextRun: sc.nextRun || null,
      apiBaseUrl: st.apiBaseUrl, apiKey: st.apiKey, model: st.apiModel,
    }));
    await fetch("/api/pc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" },
      body: JSON.stringify({ op: "/schedules/set", schedules }),
    });
  } catch {}
}

// Daily full-store backup to disk (agent-bridge/backups/) — the no-SQLite
// answer to "browser data cleared = everything gone". Key masked; last 7 kept.
let backingUp = false;
async function autoBackup() {
  if (backingUp) return;
  backingUp = true;
  try {
    const st = useStore.getState();
    const last = st.lastBackupAt ? Date.parse(st.lastBackupAt) : 0;
    if (Date.now() - last < 20 * 60 * 60 * 1000) return;
    const state = { ...st };
    delete state.toasts;
    const plain = JSON.stringify(state, (k, v) => (k === "apiKey" ? "***BACKUP***" : v));
    if (plain.length > 5 * 1024 * 1024) return; // over proxy cap — skip silently
    const name = `chatbox-auto-${new Date().toISOString().slice(0, 10)}.json`;
    const res = await fetch("/api/pc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" },
      body: JSON.stringify({ op: "/backup/store", json: plain, name }),
    });
    if (res.ok) useStore.setState({ lastBackupAt: new Date().toISOString() });
  } catch {} finally {
    backingUp = false;
  }
}

export async function backupNow() {
  try {
    const st = useStore.getState();
    useStore.setState({ lastBackupAt: null });
    const state = { ...st };
    delete state.toasts;
    const plain = JSON.stringify(state, (k, v) => (k === "apiKey" ? "***BACKUP***" : v));
    if (plain.length > 5 * 1024 * 1024) return { ok: false, error: "state too large (5MB cap)" };
    const name = `chatbox-auto-${new Date().toISOString().slice(0, 10)}.json`;
    const res = await fetch("/api/pc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-chatbox-client": "chatbox-web-1" },
      body: JSON.stringify({ op: "/backup/store", json: plain, name }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      useStore.setState({ lastBackupAt: new Date().toISOString() });
      return { ok: true, name: data.name };
    }
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    backingUp = false;
  }
}

function computeNext(schedule, fromNow = Date.now()) {
  if (schedule.kind === "daily") {
    const [h, m] = String(schedule.dailyTime || "09:00").split(":").map((x) => parseInt(x) || 0);
    const d = new Date(fromNow);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= fromNow) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const every = Math.max(5, Number(schedule.everyMinutes) || 60);
  return fromNow + every * 60_000;
}

function tick() {
  const st = useStore.getState();
  const schedules = st.schedules || [];
  if (!schedules.length) return;
  const now = Date.now();
  for (const sc of schedules) {
    if (!sc.enabled) continue;
    // initialize nextRun lazily
    if (!sc.nextRun) {
      st.updateSchedule(sc.id, { nextRun: computeNext(sc, now) });
      continue;
    }
    // Missed-by-more-than-10-minutes (app was closed) → skip forward instead
    // of stampeding old runs.
    if (now >= sc.nextRun) {
      const missed = now - sc.nextRun > 10 * 60_000;
      st.updateSchedule(sc.id, { lastRun: new Date().toISOString(), nextRun: computeNext(sc, missed ? now : sc.nextRun) });
      if (!missed) {
        try {
          window.dispatchEvent(new CustomEvent("cb:schedule-run", { detail: { prompt: sc.prompt, id: sc.id } }));
        } catch {}
      }
    }
  }
}

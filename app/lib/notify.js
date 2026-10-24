"use client";

// Unread badge in the tab title + (optional) system notification when a long
// run finishes while the tab isn't focused. Safe to call from anywhere
// (components, module-level agent runners). Focus resets the counter — the
// focus/visibility listeners live in ChatPanel.

let unread = 0;
let baseTitle = null;

export function notifyDone(body) {
  try {
    if (typeof document === "undefined" || document.hasFocus()) return;
    unread += 1;
    if (baseTitle == null) baseTitle = document.title || "Chatbox";
    document.title = `(${unread}) ${baseTitle}`;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Chatbox", { body: String(body || "").slice(0, 120), silent: true, tag: "chatbox-reply" });
    }
  } catch {}
}

export function resetUnread() {
  try {
    if (unread && baseTitle) document.title = baseTitle;
    unread = 0;
  } catch {}
}

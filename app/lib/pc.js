// Client helper for talking to the Local PC Agent (bridge) through /api/pc.
// The browser never talks to the bridge directly — the Next.js server proxies
// it so the token stays server-side except for the explicit SSE stream.

import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from "./guard";

export async function pc(op, params = {}) {
  const res = await fetch("/api/pc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CLIENT_HEADER]: CLIENT_HEADER_VALUE, // proves this is our own app, not a forged cross-site request
    },
    body: JSON.stringify({ op, ...params }),
  });
  // Session expired / invalidated → go re-authenticate instead of failing
  // every call with 401s.
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    return { ok: false, error: "authentication required" };
  }
  return res.json();
}

// Bridge liveness — no auth needed on the bridge side.
export async function bridgeStatus() {
  return pc("status");
}

// SSE stream for terminal/process output. The Next route proxies the bridge's
// /stream/:id so only this same-origin endpoint is exposed to the browser.
export function streamUrl(id, since = 0) {
  return `/api/pc/stream?id=${encodeURIComponent(id)}&since=${since}`;
}

// Split a full path into workspace-relative display name.
export function relName(full, workspace) {
  if (!workspace) return full;
  const norm = String(full).replace(/\\/g, "/");
  const ws = String(workspace).replace(/\\/g, "/").replace(/\/$/, "");
  return norm.startsWith(ws + "/") ? norm.slice(ws.length + 1) : norm;
}

// Monaco language id from a file extension.
export function langOf(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    json: "json", md: "markdown", py: "python", java: "java", c: "c", h: "c",
    cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", go: "go", rs: "rust",
    php: "php", sql: "sql", sh: "shell", bash: "shell", bat: "bat", ps1: "powershell",
    yml: "yaml", yaml: "yaml", xml: "xml", svg: "xml", rb: "ruby", kt: "kotlin",
    swift: "swift", lua: "lua", pl: "perl", r: "r", txt: "plaintext", ini: "ini",
    toml: "ini", env: "ini", lock: "plaintext",
  };
  return map[ext] || "plaintext";
}

// Files the agent should never open or send to the AI (TRD §9 / master §37).
export const PROTECTED_FILES = [".env", ".env.local", ".env.production", "id_rsa", "id_ed25519"];
export function isProtected(name) {
  const base = name.split(/[\\/]/).pop().toLowerCase();
  return PROTECTED_FILES.includes(base);
}

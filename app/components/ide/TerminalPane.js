"use client";

// Terminal (master §16 / UI spec §10) — real bridge shell sessions rendered in
// xterm.js. Output streams over SSE (/api/pc/stream → bridge /stream/:id).
// Client-side line editing (no PTY): typed chars echo locally, Enter submits.

import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, X, Trash2, Square } from "lucide-react";
import { pc, streamUrl } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";

export default function TerminalPane({ workspace }) {
  const terminals = useIde((s) => s.terminals);
  const addTerminal = useIde((s) => s.addTerminal);
  const removeTerminal = useIde((s) => s.removeTerminal);
  const [activeId, setActiveId] = useState(null);
  const [shellKind, setShellKind] = useState("cmd"); // cmd | powershell
  const [running, setRunning] = useState({});
  const holderRef = useRef(null);
  const xrefs = useRef({});        // id → { term, fitAddon, lineBuf }
  const esRef = useRef(null);

  const createSession = useCallback(async () => {
    const r = await pc("/term/create", { cwd: workspace || undefined, shell: shellKind });
    if (r?.ok) {
      addTerminal(r.id, `${r.shell === "powershell" ? "PS" : "Shell"} ${r.id.slice(-4)}`);
      setActiveId(r.id);
      return r.id;
    }
    return null;
  }, [workspace, addTerminal, shellKind]);

  // first session on mount
  useEffect(() => {
    if (!terminals.length) createSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeOut = (id, text) => {
    const x = xrefs.current[id];
    if (!x) return;
    x.term.write(text.replace(/\r?\n/g, "\r\n"));
  };

  const prompt = (id, cwd) => {
    const x = xrefs.current[id];
    if (!x) return;
    const short = (cwd || workspace || "~").split(/[\\/]/).filter(Boolean).slice(-1)[0] || "~";
    x.term.write(`\r\n\x1b[38;5;39m${short}\x1b[0m \x1b[38;5;245m$\x1b[0m `);
  };

  // attach xterm for the active session
  useEffect(() => {
    if (!activeId || !holderRef.current) return;
    if (xrefs.current[activeId]) {
      holderRef.current.innerHTML = "";
      holderRef.current.appendChild(xrefs.current[activeId].container);
      return;
    }
    let disposed = false;
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"), import("@xterm/addon-fit"),
      ]);
      await import("@xterm/xterm/css/xterm.css");
      if (disposed || !holderRef.current) return;
      const container = document.createElement("div");
      container.style.height = "100%";
      holderRef.current.appendChild(container);
      const term = new Terminal({
        fontSize: 12.5, cursorBlink: true, convertEol: false,
        theme: { background: "rgba(0,0,0,0)", foreground: "#d6deeb", cursor: "#7dd3fc" },
        scrollback: 4000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      try { fit.fit(); } catch {}
      xrefs.current[activeId] = { term, fit, container, lineBuf: "" };

      term.onData((data) => {
        const x = xrefs.current[activeId];
        if (!x) return;
        if (data === "\r") {
          const cmd = x.lineBuf;
          x.lineBuf = "";
          if (cmd.trim() === "clear" || cmd.trim() === "cls") { term.clear(); prompt(activeId); return; }
          if (cmd.trim()) {
            setRunning((r) => ({ ...r, [activeId]: true }));
            pc("/term/write", { id: activeId, input: cmd }).then((r) => {
              if (!r?.ok) term.write(`\r\n\x1b[31m${r?.error || "write failed"}\x1b[0m`);
              setTimeout(() => prompt(activeId), 250);
              setTimeout(() => setRunning((rr) => ({ ...rr, [activeId]: false })), 400);
            });
          } else prompt(activeId);
        } else if (data === "\u007f") { // backspace
          if (x.lineBuf.length) { x.lineBuf = x.lineBuf.slice(0, -1); term.write("\b \b"); }
        } else if (data >= " ") { x.lineBuf += data; term.write(data); }
      });

      // stream bridge output — kept on the session entry so killSession can
      // close it (an unclosed EventSource leaks one connection per terminal;
      // browsers cap ~6 concurrent per host).
      const es = new EventSource(streamUrl(activeId));
      es.onmessage = (ev) => {
        try {
          const { text } = JSON.parse(ev.data);
          if (text) writeOut(activeId, text);
        } catch {}
      };
      xrefs.current[activeId].es = es;
      esRef.current = es;

      // seed backlog + prompt
      pc("/term/output", { id: activeId, since: 0 }).then((r) => {
        if (r?.ok && r.new) writeOut(activeId, r.new);
        prompt(activeId);
      });
    })();
    return () => { disposed = true; };
  }, [activeId, workspace]);

  const killSession = async (id) => {
    await pc("/term/kill", { id });
    try { xrefs.current[id]?.es?.close(); } catch {}
    try { xrefs.current[id]?.term?.dispose(); } catch {}
    delete xrefs.current[id];
    removeTerminal(id);
    const rest = terminals.filter((t) => t.id !== id);
    setActiveId(rest[0]?.id || null);
    if (!rest.length) createSession();
  };

  const interrupt = async () => {
    if (activeId) await pc("/term/write", { id: activeId, input: String.fromCharCode(3) });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
        {terminals.map((t) => (
          <div key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`group flex cursor-pointer items-center gap-1.5 rounded-t px-2.5 py-1 text-[11.5px] ${
              t.id === activeId ? "bg-white/10 text-[var(--txt)]" : "text-[var(--txt-dim)] hover:bg-white/5"
            }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${running[t.id] ? "bg-amber-400" : "bg-emerald-400"}`} />
            {t.label}
            <button className="rounded p-0.5 opacity-0 hover:bg-white/15 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); killSession(t.id); }}>
              <X size={10} />
            </button>
          </div>
        ))}
        <button title="New terminal" className="rounded p-1 text-[var(--txt-dim)] hover:bg-white/10 hover:text-[var(--txt)]" onClick={createSession}>
          <Plus size={13} />
        </button>
        {/* shell type selector: CMD / PowerShell */}
        <div className="ml-auto flex items-center overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
          {["cmd", "powershell"].map((s) => (
            <button key={s} title={`New terminals will use ${s === "cmd" ? "CMD" : "PowerShell"}`}
              onClick={() => setShellKind(s)}
              className={`px-2 py-0.5 text-[10px] font-semibold ${shellKind === s ? "bg-[var(--accent)] text-black" : "text-[var(--txt-dim)] hover:bg-white/10"}`}>
              {s === "cmd" ? "CMD" : "PS"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {running[activeId] && (
            <button title="Send Ctrl+C" className="rounded p-1 text-[var(--txt-dim)] hover:bg-white/10 hover:text-red-400" onClick={interrupt}>
              <Square size={11} />
            </button>
          )}
          <button title="Clear" className="rounded p-1 text-[var(--txt-dim)] hover:bg-white/10 hover:text-[var(--txt)]"
            onClick={() => { xrefs.current[activeId]?.term?.clear(); prompt(activeId); }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div ref={holderRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1.5" />
    </div>
  );
}

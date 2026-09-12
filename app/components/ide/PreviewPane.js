"use client";

// Live Preview (master §19) — shows a running dev server inside an iframe.
// Port comes from the bridge's process list (auto-detected from server output).

import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink, Globe } from "lucide-react";
import { pc } from "@/lib/pc";

export default function PreviewPane() {
  const [port, setPort] = useState(null);
  const [procs, setProcs] = useState([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await pc("/proc/list");
      if (!alive) return;
      setProcs(r?.procs || []);
      const running = (r?.procs || []).filter((p) => p.status === "running" && p.port);
      setPort(running[0]?.port || null);
    };
    load();
    const iv = setInterval(load, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [nonce]);

  const running = procs.filter((p) => p.status === "running");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5 text-[12px]">
        <Globe size={13} className="text-[var(--accent)]" />
        {port ? (
          <>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] text-emerald-400">server on :{port}</span>
            <code className="text-[11px] text-[var(--txt-dim)]">http://localhost:{port}</code>
          </>
        ) : (
          <span className="text-[var(--txt-dim)]">
            {running.length ? "waiting for a port…" : "no running dev server — ask the AI or start one in the terminal"}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button title="Reload" className="rounded p-1 hover:bg-white/10" onClick={() => setNonce((n) => n + 1)}><RefreshCw size={13} /></button>
          {port && (
            <a title="Open in new tab" href={`http://localhost:${port}`} target="_blank" rel="noreferrer"
              className="rounded p-1 hover:bg-white/10"><ExternalLink size={13} /></a>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-white">
        {port ? (
          <iframe key={`${port}-${nonce}`} src={`http://localhost:${port}`} className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms" title="Live preview" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--bg)] text-center text-[var(--txt-dim)]">
            <Globe size={36} strokeWidth={1.2} />
            <p className="text-[13px]">Start a dev server to see a live preview here</p>
            <p className="text-[11px] opacity-70">e.g. <code>npm run dev</code> in the terminal, or ask the AI agent</p>
          </div>
        )}
      </div>
    </div>
  );
}

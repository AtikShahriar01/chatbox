"use client";

// Live Preview (master §19) — shows a running dev server inside an iframe.
// Port comes from the bridge's process list (auto-detected from server output).
// Static mode: when the agent calls show_html, the written HTML file renders
// here through the sandboxed /api/pc/html route (opaque origin — no access to
// the app's cookies/localStorage), until the user closes it.

import { useEffect, useState } from "react";
import { RefreshCw, ExternalLink, Globe, X, FileCode } from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";

export default function PreviewPane() {
  const [port, setPort] = useState(null);
  const [procs, setProcs] = useState([]);
  const [nonce, setNonce] = useState(0);
  const previewPath = useIde((s) => s.previewPath);
  const setPreviewPath = useIde((s) => s.setPreviewPath);

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
        {previewPath ? (
          <>
            <span className="flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10.5px] text-sky-400">
              <FileCode size={10} /> static preview
            </span>
            <code className="truncate text-[11px] text-[var(--txt-dim)]" title={previewPath}>{previewPath}</code>
            <button title="Close static preview — back to dev-server mode"
              onClick={() => setPreviewPath(null)}
              className="rounded p-0.5 hover:bg-white/10"><X size={12} /></button>
          </>
        ) : port ? (
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
          {previewPath ? (
            <a title="Open in new tab" href={`/api/pc/html?path=${encodeURIComponent(previewPath)}`} target="_blank" rel="noreferrer"
              className="rounded p-1 hover:bg-white/10"><ExternalLink size={13} /></a>
          ) : port && (
            <a title="Open in new tab" href={`http://localhost:${port}`} target="_blank" rel="noreferrer"
              className="rounded p-1 hover:bg-white/10"><ExternalLink size={13} /></a>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-white">
        {previewPath ? (
          <iframe key={`static-${previewPath}-${nonce}`} src={`/api/pc/html?path=${encodeURIComponent(previewPath)}`}
            className="h-full w-full border-0"
            // No allow-same-origin: the page runs in an opaque origin — it can
            // render and script, but cannot touch the app's cookies/storage/keys.
            sandbox="allow-scripts allow-modals allow-popups"
            title="Static preview" />
        ) : port ? (
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

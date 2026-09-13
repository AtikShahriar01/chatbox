"use client";

// Editor tabs (master §12/§13/§14) — Monaco with local loader (offline),
// dirty markers, diff view for AI changes, Ctrl+S save, per-tab status.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { X, Circle, Save, GitCompare, Undo2, FileCode, MessageSquareText, Wand2, Wrench } from "lucide-react";
import { pc, langOf } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";
import { useStore } from "@/lib/store";
import { useUi } from "@/lib/ui-store";

// Monaco loads from /monaco-vscode (local copy in /public — no CDN, works
// offline, and keeps the CSP 'self'-only script rule honest). Without this
// config @monaco-editor/react silently pulls loader.js from a public CDN.
import { loader as monacoLoader } from "@monaco-editor/react";
monacoLoader.config({ paths: { vs: "/monaco-vscode" } });

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12px] text-[var(--txt-dim)]">
      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      loading editor…
    </div>
  ),
  ssr: false,
});

const MonacoDiff = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12px] text-[var(--txt-dim)]">loading diff…</div>
  ),
  ssr: false,
});

function beforeMount(monaco) {
  monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions?.({
    noSemanticValidation: true, noSyntaxValidation: false,
  });
}

export default function EditorTabs({ workspace, aiTargetRef }) {
  const tabs = useIde((s) => s.tabs);
  const activePath = useIde((s) => s.activePath);
  const setActive = useIde((s) => s.setActive);
  const closeTab = useIde((s) => s.closeTab);
  const updateTab = useIde((s) => s.updateTab);
  const markSaved = useIde((s) => s.markSaved);
  const refreshTree = useIde((s) => s.refreshTree);
  const pushActivity = useIde((s) => s.pushActivity);
  const [showDiff, setShowDiff] = useState({});
  const active = tabs.find((t) => t.path === activePath);
  const editorRef = useRef(null);
  // §11 selection AI: send the selected code (or whole file) to the chat with a
  // guided prompt — Explain / Refactor / Fix — via the existing chat-draft bridge.
  const aiSelection = (kind) => {
    const ed = editorRef.current;
    let text = "";
    try {
      const model = ed?.getModel?.();
      const sel = ed?.getSelection?.();
      text = model && sel ? model.getValueInRange(sel) : (model?.getValue?.() || "");
    } catch { text = ""; }
    const file = active?.path?.split(/[\\/]/).pop() || "";
    const snippet = text.trim().slice(0, 6000) || "(nothing selected — whole file)";
    const lead = kind === "explain" ? "Explain this code from " + file + " in simple words (what it does, any bugs):\n"
      : kind === "refactor" ? "Refactor this code in " + file + " for clarity/safety without changing behavior; show the full updated file in a code block:\n"
      : "Find and fix the problems in this code from " + file + "; give the corrected full file:\n";
    useStore.getState().setChatInputDraft(lead + "```\n" + snippet + "\n```");
    useUi.getState().setView("chat");
  };

  const saveTab = useCallback(async (tab) => {
    if (!tab) return;
    const r = await pc("/file/write", { path: tab.path, content: tab.content });
    if (r?.ok) {
      markSaved(tab.path, tab.content);
      pushActivity({ actor: "user", action: "save", resource: tab.path, result: "ok", risk: "low" });
      refreshTree();
    } else {
      pushActivity({ actor: "user", action: "save", resource: tab.path, result: String(r?.error || "error").slice(0, 120), risk: "low" });
    }
  }, [markSaved, pushActivity, refreshTree]);

  // Ctrl/Cmd+S (master §43)
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (active) saveTab(active);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, saveTab]);

  if (!tabs.length || !active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--txt-dim)]">
        <FileCode size={40} strokeWidth={1.2} />
        <p className="text-[13px]">Open a file from the explorer to start editing</p>
        <p className="text-[11px] opacity-70">Ctrl+S saves · right-click files for AI actions</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* tab strip */}
      <div className="flex items-stretch overflow-x-auto border-b border-white/5 bg-black/10">
        {tabs.map((t) => (
          <div key={t.path}
            onClick={() => setActive(t.path)}
            className={`group flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-[12.5px] ${
              t.path === activePath
                ? "border-[var(--accent)] bg-white/[0.05] text-[var(--txt)]"
                : "border-transparent text-[var(--txt-dim)] hover:bg-white/[0.03]"
            }`}
            title={t.path}
          >
            {t.isDiff || showDiff[t.path] ? <GitCompare size={12} className="text-[var(--accent)]" /> : null}
            <span className={`max-w-40 truncate ${t.dirty ? "italic" : ""}`}>{t.name}</span>
            {t.dirty ? <Circle size={7} className="fill-amber-400 text-amber-400" /> : null}
            <button
              className="ml-0.5 rounded p-0.5 opacity-0 hover:bg-white/15 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); closeTab(t.path); }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1 text-[11px] text-[var(--txt-dim)]">
        <span className="truncate" title={active.path}>{active.path}</span>
        {active.aiChange && (
          <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">AI edit — {active.aiChange.taskId?.slice(0, 6)}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {active.original !== active.content && (
            <>
              <button className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" onClick={() => setShowDiff((d) => ({ ...d, [active.path]: !d[active.path] }))}>
                <GitCompare size={12} /> {showDiff[active.path] ? "Edit" : "Diff"}
              </button>
              <button className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" title="Revert to last saved"
                onClick={() => updateTab(active.path, { content: active.original, dirty: false })}>
                <Undo2 size={12} /> Revert
              </button>
            </>
          )}
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--txt-dim)] hover:bg-white/10" title="Explain selection in chat" onClick={() => aiSelection("explain")}><MessageSquareText size={12} /></button>
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--txt-dim)] hover:bg-white/10" title="Refactor selection (AI)" onClick={() => aiSelection("refactor")}><Wand2 size={12} /></button>
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--txt-dim)] hover:bg-white/10" title="Fix problems in selection (AI)" onClick={() => aiSelection("fix")}><Wrench size={12} /></button>
          <button
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${active.dirty ? "bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30" : "opacity-50"}`}
            onClick={() => saveTab(active)} disabled={!active.dirty}
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      {/* monaco */}
      <div className="min-h-0 flex-1">
        {showDiff[active.path] && active.original != null ? (
          <MonacoDiff
            key={active.path + ":diff"}
            original={active.original}
            modified={active.content}
            language={langOf(active.name)}
            theme="vs-dark"
            onMount={(editor) => { try { editor.getModifiedEditor()?.onDidChangeModelContent?.((e) => { /* diff read-only below */ }); } catch {} }}
            options={{
              fontSize: 13, automaticLayout: true, readOnly: true,
              renderSideBySide: true, diffWordWrap: "on", renderOverviewRuler: false,
            }}
          />
        ) : (
          <MonacoEditor
            key={active.path}
            path={active.path}
            language={langOf(active.name)}
            theme="vs-dark"
            beforeMount={beforeMount}
            onMount={(editor) => {
              editorRef.current = editor;
              // If the editor mounts while its container is mid-layout (view
              // switch / panel animation) it measures ~0×0 and renders blank.
              // Force a re-layout now and once more after the next frame.
              try { editor.layout(); } catch {}
              setTimeout(() => { try { editor.layout(); } catch {} }, 120);
            }}
            value={active.content}
            onChange={(v) => updateTab(active.path, { content: v ?? "", dirty: (v ?? "") !== active.original })}
            options={{
              fontSize: 13, minimap: { enabled: true, scale: 1 }, readOnly: false,
              automaticLayout: true, tabSize: 2, wordWrap: "on", smoothScrolling: true,
              renderLineHighlight: "all", cursorBlinking: "smooth", padding: { top: 10 },
              scrollBeyondLastLine: false, bracketPairColorization: { enabled: true },
            }}
          />
        )}
      </div>
    </div>
  );
}

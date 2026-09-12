"use client";

// File Explorer (master §15 / UI spec §8) — tree navigation, create/rename/
// delete/move via context menu, file-type icons, search filter, refresh,
// and a workspace (project folder) picker: everything the agent does stays
// inside the chosen folder — never another drive.

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, FileText, FileCode, FileJson,
  RefreshCw, Plus, Search, Trash2, PenLine, FolderPlus, Copy, Sparkles,
  FolderInput, ChevronUp,
} from "lucide-react";
import { pc } from "@/lib/pc";
import { useIde } from "@/lib/ide-store";

const ICONS = [
  [".js", FileCode, "#eab308"], [".jsx", FileCode, "#38bdf8"], [".ts", FileCode, "#3b82f6"],
  [".tsx", FileCode, "#60a5fa"], [".json", FileJson, "#facc15"], [".css", FileText, "#22d3ee"],
  [".md", FileText, "#94a3b8"], [".sh", FileCode, "#4ade80"], [".bat", FileCode, "#a3a3a3"],
];
function iconFor(name, dir) {
  if (dir) return [Folder, "#e8b356"];
  const ext = "." + (name.split(".").pop() || "").toLowerCase();
  const hit = ICONS.find(([e]) => e === ext);
  return hit ? [hit[1], hit[2]] : [FileText, "#8b93a7"];
}

export default function FileExplorer({ workspace, onOpenFile }) {
  const treeVersion = useIde((s) => s.treeVersion);
  const refreshTree = useIde((s) => s.refreshTree);
  const pushActivity = useIde((s) => s.pushActivity);
  const [root, setRoot] = useState("");
  const [expanded, setExpanded] = useState({});      // path → bool
  const [cache, setCache] = useState({});            // path → entries[]
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(null);            // {x, y, path, name, dir}
  const [creating, setCreating] = useState(null);    // {parent, type}
  const [renaming, setRenaming] = useState(null);    // {path, oldName}
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  const list = useCallback(async (p) => {
    const r = await pc("/file/list", { path: p });
    if (r?.ok) {
      setCache((c) => ({ ...c, [r.path]: r.entries }));
      // Only set root on the FIRST load (workspace root) — never when expanding
      // subfolders (that used to wipe the visible tree: "expand loses files").
      setRoot((cur) => cur || r.path);
      return r.entries;
    }
    return null;
  }, []);

  useEffect(() => { setLoading(true); list("").finally(() => setLoading(false)); }, [list, treeVersion]);

  const toggle = async (p) => {
    const next = !expanded[p];
    setExpanded((e) => ({ ...e, [p]: next }));
    if (next && !cache[p]) await list(p);
  };

  const openFile = async (full, name) => {
    const r = await pc("/file/read", { path: full });
    if (r?.ok) onOpenFile(r.path, name, r.content);
    else pushActivity({ actor: "user", action: "open file", resource: full, result: String(r?.error || "error").slice(0, 100), risk: "low" });
  };

  const createEntry = async (parent, type, name) => {
    if (!name) return;
    // Never build a path from an empty root — that produced the confusing
    // "can't locate folder" error when the tree/bridge was still loading.
    const base = parent || root || workspace;
    if (!base) {
      pushActivity({ actor: "user", action: `create ${type}`, resource: name, result: "workspace not loaded yet — wait a second or start the bridge", risk: "low" });
      return;
    }
    const full = base + "\\" + name;
    const r = type === "folder"
      ? await pc("/file/mkdir", { path: full })
      : await pc("/file/write", { path: full, content: "" });
    pushActivity({ actor: "user", action: `create ${type}`, resource: full, result: r?.ok ? "ok" : String(r?.error).slice(0, 100), risk: "low" });
    refreshTree();
    if (type === "file" && r?.ok) onOpenFile(r.path || full, name, "");
  };

  const doRename = async () => {
    if (!renaming || !draft || draft === renaming.oldName) return setRenaming(null);
    const to = renaming.path.slice(0, renaming.path.length - renaming.oldName.length) + draft;
    const r = await pc("/file/move", { from: renaming.path, to });
    pushActivity({ actor: "user", action: "rename", resource: `${renaming.path} → ${to}`, result: r?.ok ? "ok" : String(r?.error).slice(0, 100), risk: "low" });
    setRenaming(null); refreshTree();
  };

  const doDelete = async (p, name) => {
    // Recursive delete is irreversible (bridge "auto" mode never asks) —
    // always confirm in the browser first.
    if (!window.confirm(`"${name || p}" ডিলিট করবেন?${p.includes("\\") && cache[p] ? " এর ভেতরের সবকিছুসহ (recursive)।" : ""}\n\nThis cannot be undone.`)) return;
    const r = await pc("/file/delete", { path: p, recursive: true });
    pushActivity({ actor: "user", action: "delete", resource: p, result: r?.ok ? "ok" : String(r?.error).slice(0, 100), risk: "high" });
    refreshTree();
  };

  const copyPath = (p) => { try { navigator.clipboard.writeText(p); } catch {} };

  // Project folder picker: sets the bridge workspace so EVERY operation —
  // explorer edits AND agent tasks — lands inside this folder. The bridge
  // confines all paths to the workspace and rejects anything outside it
  // (other drives are impossible to touch).
  const pickFolder = async () => {
    const p = window.prompt(
      "প্রজেক্ট ফোল্ডারের পুরো path দিন (যেমন H:\\my-projects\\my-app)\n\n⚠ সব কাজ এই ফোল্ডারের ভেতরেই থাকবে — অন্য কোনো ড্রাইভ/ফোল্ডারে যাবে না।",
      root || ""
    );
    if (p == null) return; // cancelled
    const trimmed = p.trim();
    if (!trimmed) return;
    const r = await pc("/workspace", { path: trimmed });
    if (r?.ok) {
      setExpanded({}); setCache({}); setRoot(null); // reset tree fully
      await list(r.workspace);
      pushActivity({ actor: "user", action: "workspace change", resource: r.workspace, result: "ok", risk: "low" });
    } else {
      pushActivity({ actor: "user", action: "workspace change", resource: trimmed, result: String(r?.error || "error").slice(0, 100), risk: "low" });
    }
  };

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  // Row is defined OUTSIDE the JSX so its identity is stable — defining it
  // inline remounted the whole tree on every keystroke (broke IME caret).
  const renderRow = (e, parent, depth) => {
    const full = (parent ? parent + "\\" : "") + e.name;
    const isOpen = !!expanded[full];
    const [Icon, color] = iconFor(e.name, e.dir);
    const matches = !query || e.name.toLowerCase().includes(query.toLowerCase());
    return (
      <>
        {matches && (
          <motion.div
            layout="position"
            className="group flex items-center gap-1 rounded-md px-2 py-[3px] cursor-pointer select-none hover:bg-white/[0.06]"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => (e.dir ? toggle(full) : openFile(full, e.name))}
            onContextMenu={(ev) => { ev.preventDefault(); setMenu({ x: ev.clientX, y: ev.clientY, path: full, name: e.name, dir: e.dir, parent }); }}
            whileTap={{ scale: 0.985 }}
          >
            <span className="w-3.5 shrink-0 text-[var(--txt-dim)]">
              {e.dir ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
            </span>
            <Icon size={14} style={{ color }} className="shrink-0" />
            {renaming?.path === full ? (
              <input
                autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)}
                onBlur={doRename} onKeyDown={(ev) => ev.key === "Enter" && doRename()}
                className="ml-1 flex-1 rounded bg-black/40 px-1 text-[13px] outline-none ring-1 ring-[var(--accent)]"
                onClick={(ev) => ev.stopPropagation()}
              />
            ) : (
              <span className="ml-1.5 truncate text-[13px]">{e.name}</span>
            )}
            {e.size != null && !e.dir && e.size > 1024 && (
              <span className="ml-auto hidden text-[10px] text-[var(--txt-dim)] group-hover:inline">
                {(e.size / 1024).toFixed(0)}k
              </span>
            )}
          </motion.div>
        )}
        {e.dir && isOpen && (cache[full] || []).map((c) => renderRow(c, full, depth + 1))}
      </>
    );
  };

  return (
    <div className="flex h-full flex-col text-[var(--txt)]">
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
        <span className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--txt-dim)]">Explorer</span>
        <button title="Change project folder" className="rounded p-1 hover:bg-white/10" onClick={pickFolder}>
          <FolderInput size={14} />
        </button>
        <button title={root ? "New file" : "Workspace লোড হচ্ছে…"} disabled={!root} className="rounded p-1 hover:bg-white/10 disabled:opacity-40" onClick={() => { setCreating({ type: "file", parent: root }); setDraft(""); }}>
          <Plus size={14} />
        </button>
        <button title={root ? "New folder" : "Workspace লোড হচ্ছে…"} disabled={!root} className="rounded p-1 hover:bg-white/10 disabled:opacity-40" onClick={() => { setCreating({ type: "folder", parent: root }); setDraft(""); }}>
          <FolderPlus size={14} />
        </button>
        <button title="Refresh" className="rounded p-1 hover:bg-white/10" onClick={refreshTree}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="border-b border-white/5 px-2 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md bg-black/25 px-2 py-1">
          <Search size={12} className="text-[var(--txt-dim)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter files…"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--txt-dim)]" />
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {creating && (
          <div className="mx-2 mb-1 flex items-center gap-1.5 rounded-md bg-black/30 px-2 py-1.5">
            <span className="text-[11px] text-[var(--txt-dim)]">{creating.type === "file" ? "📄" : "📁"}</span>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="name"
              onKeyDown={(e) => {
                if (e.key === "Enter") { createEntry(creating.parent, creating.type, draft); setCreating(null); }
                if (e.key === "Escape") setCreating(null);
              }}
              onBlur={() => { if (draft) createEntry(creating.parent, creating.type, draft); setCreating(null); }}
              className="flex-1 bg-transparent text-[13px] outline-none" />
          </div>
        )}
        {(cache[root] || []).map((e) => renderRow(e, root, 0))}
        {root && (
          <div className="mt-2 px-3 pb-1 text-[10px] leading-relaxed text-[var(--txt-dim)]">
            <div className="flex items-center gap-1">
              <span className="truncate" title={root}>Workspace: {root}</span>
              <button title="Change project folder" className="ml-auto shrink-0 rounded p-0.5 hover:bg-white/10" onClick={pickFolder}>
                <ChevronUp size={11} className="rotate-180" />
              </button>
            </div>
            <p className="mt-0.5 opacity-70">সব কাজ এই ফোল্ডারেই হবে — অন্য ড্রাইভ blocked</p>
          </div>
        )}
      </div>

      {/* context menu (UI spec §8) */}
      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[80] w-52 overflow-hidden rounded-lg border border-white/10 bg-[var(--panel-bg)] py-1 shadow-2xl backdrop-blur-xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }}
          >
            {[
              { icon: FileText, label: menu.dir ? "Open (expand)" : "Open", fn: () => !menu.dir && openFile(menu.path, menu.name) },
              { icon: PenLine, label: "Rename", fn: () => { setRenaming({ path: menu.path, oldName: menu.name }); setDraft(menu.name); } },
              { icon: Copy, label: "Copy path", fn: () => copyPath(menu.path) },
              { icon: Plus, label: "New file here", fn: () => { setCreating({ type: "file", parent: menu.dir ? menu.path : menu.parent }); setDraft(""); } },
              { icon: FolderPlus, label: "New folder here", fn: () => { setCreating({ type: "folder", parent: menu.dir ? menu.path : menu.parent }); setDraft(""); } },
              { icon: Trash2, label: "Delete", fn: () => doDelete(menu.path, menu.name), danger: true },
            ].map((it) => (
              <button key={it.label}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-white/10 ${it.danger ? "text-red-400" : ""}`}
                onClick={() => { setMenu(null); it.fn(); }}>
                <it.icon size={14} /> {it.label}
              </button>
            ))}
            <div className="my-1 border-t border-white/10" />
            <button className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-white/10"
              onClick={() => { setMenu(null); onOpenFile("__ai__", menu.name, "", { aiTarget: menu }); }}>
              <Sparkles size={14} className="text-[var(--accent)]" /> AI: explain / edit this
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

// EmptyState / ErrorState / Skeleton (spec-5 §LOADING/EMPTY/ERROR STATES + §16)
import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";

export function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
      <div className="rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
        <Icon size={26} strokeWidth={1.4} style={{ color: "var(--accent)" }} />
      </div>
      <p className="text-[13.5px] font-semibold">{title}</p>
      {body && <p className="max-w-xs text-[12px] leading-relaxed" style={{ color: "var(--txt-dim)" }}>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, details }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
      <div className="rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--err) 12%, transparent)" }}>
        <AlertTriangle size={24} strokeWidth={1.5} style={{ color: "var(--err)" }} />
      </div>
      <p className="text-[13.5px] font-semibold">{title}</p>
      {body && <p className="max-w-sm text-[12px] leading-relaxed" style={{ color: "var(--txt-dim)" }}>{body}</p>}
      {details && <pre className="max-w-full overflow-auto rounded-lg p-2 text-left font-mono text-[10.5px]" style={{ background: "var(--surface-2)", color: "var(--txt-dim)", maxHeight: 120 }}>{details}</pre>}
      {onRetry && (
        <button onClick={onRetry} className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}>
          <RotateCcw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 14, r = 8, className = "" }) {
  return <div aria-hidden className={`cb-skeleton ${className}`} style={{ width: w, height: h, borderRadius: r }} />;
}

export function SkeletonList({ rows = 4, h = 44 }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--surface) 55%, transparent)" }}>
          <Skeleton w={30} h={30} r={8} />
          <div className="flex-1 space-y-1.5">
            <Skeleton w={`${70 - i * 8}%`} h={11} />
            <Skeleton w={`${45 - i * 5}%`} h={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

// Renders ```mermaid fences as SVG diagrams. mermaid is a heavy dependency,
// so it is imported lazily on the first diagram; render failures fall back to
// the raw chart text. securityLevel:"strict" — the chart text is model output.
import { useEffect, useState } from "react";

export default function MermaidBlock({ chart }) {
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.getAttribute("data-mode") === "light" ? "neutral" : "dark",
        });
        const id = `mmd-${Math.random().toString(36).slice(2, 10)}`;
        const out = await mermaid.render(id, String(chart || ""));
        if (alive) setSvg(out.svg);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, [chart]);

  if (error) {
    return <pre className="text-xs whitespace-pre-wrap" style={{ color: "var(--cb-muted)" }}>{chart}</pre>;
  }
  if (!svg) {
    return (
      <div className="cb-skel" aria-label="Rendering diagram">
        <div /><div /><div />
      </div>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-lg p-2"
      style={{ background: "var(--cb-bg)", border: "1px solid var(--cb-border)" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

"use client";

// Route redirects — /ide and /console/* now just flip the unified view
// inside the single-page app at "/" (no separate pages anymore).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/ui-store";

export default function ViewRedirect({ view, section = null }) {
  const router = useRouter();
  useEffect(() => {
    useUi.getState().setView(view);
    // Deep-link section (e.g. /console/security) — PlatformShell reads this
    // on mount. "/" alone keeps whatever section the console was on.
    if (section) useUi.getState().setConsoleSection(section);
    router.replace("/");
  }, [view, section, router]);
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cb-bg)", color: "var(--cb-muted)" }}>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--cb-accent)] border-t-transparent" />
        opening {view}…
      </div>
    </div>
  );
}

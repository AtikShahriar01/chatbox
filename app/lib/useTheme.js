"use client";

import { useEffect } from "react";
import { useStore } from "./store";

export function useThemeEffect() {
  const theme = useStore((s) => s.theme);
  const mode = useStore((s) => s.mode);
  const customColor = useStore((s) => s.customColor);
  const fontSize = useStore((s) => s.fontSize);
  const reduceMotion = useStore((s) => s.reduceMotion);

  useEffect(() => {
    const root = document.documentElement;
    const resolveMode = () => {
      if (mode === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return mode;
    };
    const effective = resolveMode();
    root.setAttribute("data-theme", theme === "custom" ? "mist-blue" : theme);
    root.setAttribute("data-mode", effective);

    // The Settings → reduceMotion option now actually does something:
    // "on" kills the animated mesh background + heavy transitions — the
    // main GPU cost on older machines. "system" follows the OS setting.
    const sysReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rmOn = reduceMotion === true || (reduceMotion === "system" && sysReduce);
    root.setAttribute("data-reduce-motion", rmOn ? "on" : "off");

    if (theme === "custom" && customColor) {
      root.style.setProperty("--cb-accent", customColor);
      root.style.setProperty("--cb-accent-hover", customColor);
      root.style.setProperty("--cb-user-bubble", customColor);
    } else {
      root.style.removeProperty("--cb-accent");
      root.style.removeProperty("--cb-accent-hover");
      root.style.removeProperty("--cb-user-bubble");
    }
    root.style.setProperty("--cb-font-size", `${fontSize}px`);
  }, [theme, mode, customColor, fontSize, reduceMotion]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.setAttribute("data-mode", mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);
}

// Wrap a theme change in a View Transition if the browser supports it.
// Falls back to an instant change otherwise.
export function transitionTheme(apply) {
  if (typeof document === "undefined") return apply();
  if (typeof document.startViewTransition === "function") {
    return document.startViewTransition(() => new Promise((resolve) => {
      apply();
      requestAnimationFrame(() => resolve());
    }));
  }
  return apply();
}

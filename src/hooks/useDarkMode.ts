import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { inkSwitch } from "@/lib/inkTransition";

interface DarkModeContextType {
  dark: boolean;
  /** Pass the click event (or nothing) — the ink spreads from where you clicked. */
  toggle: (from?: unknown) => void;
}

export const DarkModeContext = createContext<DarkModeContextType>({
  dark: false,
  toggle: () => {},
});

export function useDarkMode() {
  return useContext(DarkModeContext);
}

export function useDarkModeState() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bos_dark") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("bos_dark", String(dark));
    } catch {}
  }, [dark]);

  const toggle = (from?: unknown) => {
    const e = from as { clientX?: number; clientY?: number; currentTarget?: Element } | undefined;
    let at: { x: number; y: number } | undefined;
    const box = e && typeof e === "object" && e.currentTarget instanceof Element ? e.currentTarget.getBoundingClientRect() : null;
    if (box) at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    else if (e && typeof e === "object" && typeof e.clientX === "number" && typeof e.clientY === "number") at = { x: e.clientX, y: e.clientY };
    const next = !document.documentElement.classList.contains("dark");
    inkSwitch(() => {
      // Switch everything right now, so the browser can picture the new theme
      document.documentElement.classList.toggle("dark", next);
      flushSync(() => setDark(next));
    }, at);
  };

  return { dark, toggle };
}
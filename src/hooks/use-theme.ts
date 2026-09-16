"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "postvia-theme";

/** Blocking pre-hydration script (see layout.tsx) keeps this in sync with
 * the initial paint — dark is the product default, light is opt-in. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

/** Reads/writes the `dark` class on <html>, persisted to localStorage.
 * The initial value is read from the DOM (already set by the blocking
 * script before hydration) rather than defaulted here, so client and
 * server never disagree on first paint. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync DOM class set by the pre-hydration script on mount
    setThemeState(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode, blocked) — theme still applies
      // for this page view, it just won't persist across visits.
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}

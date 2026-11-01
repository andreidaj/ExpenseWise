"use client";

import { MotionConfig } from "framer-motion";
import { createContext, useContext, useLayoutEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth";
import { SpaceProvider } from "@/lib/space";

export type ThemeName = "dark" | "light";

const STORAGE_KEY = "ew-theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduce;
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#F3F5F9" : "#0B0F19");
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useLayoutEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked; the page still stays on the dark theme.
    }
    setThemeState("dark");
    applyTheme("dark");
  }, []);

  function setTheme(_next: ThemeName) {
    setThemeState("dark");
    applyTheme("dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <SpaceProvider>{children}</SpaceProvider>
        </AuthProvider>
      </MotionConfig>
    </ThemeContext.Provider>
  );
}

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_CHANGE_EVENT = "inspectcheck:theme-change";

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (isTheme(savedTheme)) {
      return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  }, [theme]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = event instanceof CustomEvent ? event.detail : null;
      if (typeof next === "string" && isTheme(next)) setTheme(next);
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  return {
    theme,
    toggleTheme,
    isDark: theme === "dark",
  };
}

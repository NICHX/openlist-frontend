import { create } from "zustand"

export type Theme = "light" | "dark"

const THEME_KEY = "openlist-theme"

const readInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === "light" || stored === "dark") return stored
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  } catch {
    return "light"
  }
}

/** Toggle the `dark` class on <html> (the tokens live in `index.css`). */
const applyTheme = (theme: Theme): void => {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.classList.toggle("light", theme !== "dark")
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0B1220" : "#2563EB")
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}))

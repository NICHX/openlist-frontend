import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { OrderBy, OrderDirection } from "@/api/types"

export type ViewMode = "list" | "grid"

interface PrefsState {
  /** List vs. grid layout for the browser. */
  view: ViewMode
  /** Default sort applied when a folder has no local override. */
  orderBy: OrderBy
  orderDirection: OrderDirection
  /** Bookmarked folder paths (集). */
  favorites: string[]
  /** Most recent folders (newest first, capped). */
  recent: string[]
  setView: (view: ViewMode) => void
  toggleView: () => void
  setSort: (orderBy: OrderBy, orderDirection: OrderDirection) => void
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
  pushRecent: (path: string) => void
  clearRecent: () => void
}

const RECENT_LIMIT = 20

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      view: "list",
      orderBy: "name",
      orderDirection: "asc",
      favorites: [],
      recent: [],

      setView: (view) => set({ view }),
      toggleView: () => set({ view: get().view === "list" ? "grid" : "list" }),
      setSort: (orderBy, orderDirection) => set({ orderBy, orderDirection }),

      toggleFavorite: (path) => {
        const favorites = get().favorites
        set({
          favorites: favorites.includes(path)
            ? favorites.filter((p) => p !== path)
            : [...favorites, path],
        })
      },
      isFavorite: (path) => get().favorites.includes(path),

      pushRecent: (path) => {
        const recent = [path, ...get().recent.filter((p) => p !== path)].slice(0, RECENT_LIMIT)
        set({ recent })
      },
      clearRecent: () => set({ recent: [] }),
    }),
    { name: "openlist-prefs", version: 1 },
  ),
)

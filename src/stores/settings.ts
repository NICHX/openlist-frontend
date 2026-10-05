import { create } from "zustand"
import { publicApi } from "@/api"
import type { PublicSettings } from "@/api/types"

interface SettingsState {
  settings: PublicSettings
  loaded: boolean
  loading: boolean
  load: (force?: boolean) => Promise<void>
}

/**
 * Site-wide settings from `GET /api/public/settings` (no auth needed).
 * Cached for the session; the sidebar title/logo and feature gates read it.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,
  loading: false,
  load: async (force = false) => {
    if (get().loading) return
    if (get().loaded && !force) return
    set({ loading: true })
    const resp = await publicApi.settings()
    if (resp.code === 200 && resp.data) {
      set({ settings: resp.data, loaded: true, loading: false })
    } else {
      set({ loading: false })
    }
  },
}))

export const getSetting = (key: string, fallback = ""): string => {
  const value = useSettingsStore.getState().settings[key]
  if (value === undefined || value === null) return fallback
  return String(value)
}

export const getSettingBool = (key: string, fallback = false): boolean => {
  const value = useSettingsStore.getState().settings[key]
  if (value === undefined || value === null || value === "") return fallback
  return value === true || value === "true"
}

export const getSettingNumber = (key: string, fallback = 0): number => {
  const value = Number(useSettingsStore.getState().settings[key])
  return Number.isFinite(value) ? value : fallback
}

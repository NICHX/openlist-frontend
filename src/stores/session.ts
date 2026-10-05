import { create } from "zustand"
import { authApi } from "@/api"
import { clearToken, getToken, saveUsername, setToken } from "@/api/token"
import { isAdminRole, type CurrentUser } from "@/api/types"
import { sha256Hex } from "@/lib/hash"

export type SessionStatus = "loading" | "authed" | "guest"

interface LoginOutcome {
  ok: boolean
  message?: string
  code?: number
  /** Server signalled a 2FA code is required. */
  needOtp?: boolean
}

interface SessionState {
  status: SessionStatus
  user: CurrentUser | null
  /** False when the server disabled guest access (then we must show /login). */
  guestAllowed: boolean
  /** Validate an existing token (or settle into guest mode) once at startup. */
  bootstrap: () => Promise<void>
  login: (username: string, password: string, otpCode?: string) => Promise<LoginOutcome>
  logout: () => Promise<void>
  /** Clear local auth state without a network round-trip (used on 401). */
  reset: () => void
}

/** Memoised so StrictMode / remounts can't fire duplicate startup requests. */
let bootstrapPromise: Promise<void> | null = null

export const useSessionStore = create<SessionState>((set) => ({
  status: "loading",
  user: null,
  guestAllowed: true,

  bootstrap: () => {
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        // 只有明确的鉴权失败(401/403)才清 token；网络抖动/5xx 不能判定为未登录，
        // 否则一次偶发失败会把有效会话误判成「访客被禁用」而强制跳登录页。
        const isAuthFailure = (code: number) => code === 401 || code === 403

        const token = getToken()
        if (token) {
          const resp = await authApi.me()
          if (resp.code === 200 && resp.data) {
            set({ status: "authed", user: resp.data, guestAllowed: true })
            return
          }
          if (!isAuthFailure(resp.code)) {
            set({ status: "guest", user: null, guestAllowed: true })
            return
          }
          clearToken()
        }

        // 无有效 token：探测是否允许访客浏览（guest 开启时 /api/me 返回 200）。
        const probe = await authApi.me()
        if (probe.code === 200) {
          set({ status: "guest", user: probe.data ?? null, guestAllowed: true })
        } else if (isAuthFailure(probe.code)) {
          set({ status: "guest", user: null, guestAllowed: false })
        } else {
          // 网络/服务端异常：退化为允许访客，避免误跳登录。
          set({ status: "guest", user: null, guestAllowed: true })
        }
      })()
    }
    return bootstrapPromise
  },

  login: async (username, password, otpCode = "") => {
    let resp = await authApi.login(username, password, otpCode)

    // Some deployments disable password login over the wire; retry with the
    // hashed variant before surfacing an error.
    if (resp.code !== 200 && resp.code !== 402) {
      try {
        const hashed = await sha256Hex(password)
        const hashResp = await authApi.loginHash(username, hashed, otpCode)
        if (hashResp.code === 200) resp = hashResp
      } catch {
        /* keep the original error */
      }
    }

    if (resp.code === 200 && resp.data?.token) {
      setToken(resp.data.token)
      saveUsername(username)
      const me = await authApi.me()
      if (me.code === 200) {
        set({ status: "authed", user: me.data })
      } else {
        set({ status: "authed", user: null })
      }
      return { ok: true }
    }

    return {
      ok: false,
      message: resp.message,
      code: resp.code,
      needOtp: resp.code === 402,
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      /* ignore network errors on logout */
    }
    clearToken()
    set({ status: "guest", user: null })
  },

  reset: () => {
    clearToken()
    set({ status: "guest", user: null })
  },
}))

/** True when the current session belongs to an admin (role === 2). */
export const useIsAdmin = (): boolean =>
  useSessionStore((s) => isAdminRole(s.user?.role))

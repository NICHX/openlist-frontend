import axios, { type AxiosError, type AxiosInstance, type AxiosResponse } from "axios"
import { getToken } from "./token"
import type { Resp } from "./types"

/**
 * Event fired when the server rejects the token (HTTP 401) so the auth layer
 * can clear the session and bounce the user to /login without this module
 * importing the router or the store (avoids a circular dependency).
 */
export const UNAUTHORIZED_EVENT = "openlist:unauthorized"

/** 非 JSON 响应（例如被 SPA 回退成 HTML 的未知接口）。 */
export const NON_JSON_CODE = -2

export class ApiError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = "ApiError"
    this.code = code
  }
}

const instance: AxiosInstance = axios.create({
  // Same origin in production; `vite dev` proxies /api to the OpenList host.
  baseURL: "/api",
  headers: { "Content-Type": "application/json;charset=utf-8" },
  withCredentials: false,
  // Large uploads/streams can legitimately run for a long time.
  timeout: 0,
})

instance.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    // ⚠️ OpenList compares the raw Authorization value. Never add "Bearer ".
    config.headers.set("Authorization", token)
  } else {
    config.headers.delete("Authorization")
  }
  return config
})

const isEnvelope = (value: unknown): value is Resp<unknown> =>
  !!value && typeof value === "object" && typeof (value as { code?: unknown }).code === "number"

instance.interceptors.response.use(
  // Success path: hand callers the `{ code, message, data }` envelope directly.
  (response: AxiosResponse) => {
    const payload = response.data
    const envelope: Resp<unknown> = isEnvelope(payload)
      ? payload
      : // 未注册的接口会被 SPA 的 catch-all 回退成 index.html（text/html），
        // 这里合成一个信封，避免调用方拿到 HTML 字符串后显示空白错误。
        { code: NON_JSON_CODE, message: "服务端返回了非 JSON 响应，该接口在当前版本可能不存在", data: undefined }
    // 调用方统一拿到信封（而非 AxiosResponse），故此处断言返回类型。
    return envelope as unknown as AxiosResponse
  },
  (error: AxiosError) => {
    // Network / non-2xx: normalise into the same envelope shape so callers
    // only ever branch on `code`. (Mirrors the official frontend behaviour.)
    const status = error.response?.status
    const body = error.response?.data as
      | { message?: string; data?: unknown }
      | undefined

    if (status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }

    const result: { code: number; message: string; data?: unknown } = {
      code: axios.isCancel(error) ? -1 : (status ?? -1),
      message: body?.message || error.message || "Request failed",
    }
    if (body && typeof body === "object" && body.data != null) {
      result.data = body.data
    }
    return result
  },
)

/**
 * Assert a successful envelope, throwing ApiError otherwise. Use in mutation
 * flows where a thrown error is convenient (react-query `onError`).
 */
export const unwrap = <T>(resp: Resp<T>): T => {
  if (resp.code === 200) return resp.data
  throw new ApiError(resp.message || "Request failed", resp.code)
}

export const isCancel = (resp: unknown): boolean =>
  typeof resp === "object" && resp !== null && (resp as Resp<unknown>).code === -1

export { instance as r }

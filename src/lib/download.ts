import { fsApi } from "@/api"

/** Turn a `raw_url` from `/api/fs/get` into an absolute, loadable URL. */
export const resolveRawUrl = (raw: string): string => {
  if (!raw) return ""
  if (/^https?:\/\//i.test(raw)) return raw
  try {
    return new URL(raw, window.location.origin).toString()
  } catch {
    return raw
  }
}

/**
 * OpenList 的 `/d/` 是「下载」（带 attachment），`/p/` 是「内联代理」（可流式播放），
 * 两者共用同一套 `sign` 校验。把直链里的 `/d/` 换成 `/p/` 即可得到可播放地址，
 * 用于「拉起播放器 / 在新窗口打开」而不是触发下载。
 */
export const toInlineUrl = (raw: string): string => {
  const abs = resolveRawUrl(raw)
  try {
    const url = new URL(abs)
    if (url.pathname.startsWith("/d/")) {
      url.pathname = `/p/${url.pathname.slice(3)}`
      return url.toString()
    }
  } catch {
    /* keep as-is */
  }
  return abs
}

/** Trigger a browser download without navigating away from the SPA. */
export const triggerDownload = (url: string, name?: string): void => {
  const anchor = document.createElement("a")
  anchor.href = url
  if (name) anchor.download = name
  anchor.rel = "noopener"
  anchor.target = "_blank"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Open a URL in a new tab — hands a stream off to the browser/OS player. */
export const openInNewTab = (url: string): void => {
  if (!url) return
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.target = "_blank"
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Resolve a file's direct link and open its inline stream in a new tab (拉起播放器). */
export async function openDirectLink(path: string): Promise<void> {
  const resp = await fsApi.get(path)
  if (resp.code !== 200) {
    throw new Error(resp.message || "获取链接失败")
  }
  openInNewTab(toInlineUrl(resp.data.raw_url))
}

/**
 * Resolve the file's signed direct link and download it. Resolving server-side
 * means protected/signed storages work without the frontend knowing the rules.
 */
export async function downloadFile(path: string, name?: string): Promise<void> {
  const resp = await fsApi.get(path)
  if (resp.code !== 200) {
    throw new Error(resp.message || "获取下载链接失败")
  }
  triggerDownload(resolveRawUrl(resp.data.raw_url), name ?? resp.data.name)
}

/** Copy text, preferring the async clipboard API with a legacy fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the textarea fallback */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** Resolve a path's shareable direct link for the "复制链接" action. */
export async function copyDirectLink(path: string): Promise<string> {
  const resp = await fsApi.get(path)
  if (resp.code !== 200) throw new Error(resp.message || "获取链接失败")
  const url = resolveRawUrl(resp.data.raw_url)
  const ok = await copyText(url)
  if (!ok) throw new Error("复制失败")
  return url
}

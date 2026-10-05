import { getSetting } from "@/stores/settings"

/**
 * 原版 OpenList 的「外部预览 / 打开方式」：站点设置 `external_previews` 是一段 JSON，
 * 形如 `{ "mp4,video": { "PotPlayer": "potplayer://$durl" }, ".pdf": { "..." } }`。
 * key 为逗号分隔的扩展名（以 `/` 开头则视为正则），value 为「名称 -> 带变量模板的 URL」。
 */
export interface ExternalPreviewApp {
  name: string
  url: string
}

export interface PreviewVars {
  /** 网页内联地址（/p/，可流式播放）。 */
  url: string
  /** 直链（/d/ 或存储直链）。 */
  durl: string
  name: string
}

const stripDot = (value: string) => value.replace(/^\./, "").trim().toLowerCase()

const base64 = (value: string): string => {
  try {
    return btoa(String.fromCharCode(...new TextEncoder().encode(value)))
  } catch {
    return value
  }
}

function testRegex(pattern: string, ext: string): boolean {
  const lastSlash = pattern.lastIndexOf("/")
  if (lastSlash <= 0) return false
  try {
    return new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1)).test(ext)
  } catch {
    return false
  }
}

/** 取出与扩展名匹配的外部预览应用列表；未配置或解析失败时返回空数组。 */
export function getExternalPreviews(ext: string): ExternalPreviewApp[] {
  const raw = getSetting("external_previews")
  if (!raw || raw.trim() === "" || raw.trim() === "{}") return []

  let map: Record<string, Record<string, string>>
  try {
    map = JSON.parse(raw)
  } catch {
    return []
  }
  if (!map || typeof map !== "object") return []

  const target = stripDot(ext)
  const apps: ExternalPreviewApp[] = []
  for (const [key, value] of Object.entries(map)) {
    if (!value || typeof value !== "object") continue
    const matched = key
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .some((k) => (k.startsWith("/") ? testRegex(k, target) : stripDot(k) === target))
    if (!matched) continue
    for (const [name, url] of Object.entries(value)) {
      if (typeof url === "string") apps.push({ name, url })
    }
  }
  return apps
}

/** 替换模板里的 `$url` / `$durl` / `$name`（支持 `e`=URL 编码、`b`=Base64 前缀）。 */
export function fillExternalUrl(template: string, vars: PreviewVars): string {
  return template.replace(/\$(?:(eb|e|b)_)?(url|durl|name)/g, (_match, mod: string | undefined, key: string) => {
    const value = key === "url" ? vars.url : key === "durl" ? vars.durl : vars.name
    let out = value
    if (mod?.includes("e")) out = encodeURIComponent(out)
    if (mod?.includes("b")) out = base64(out)
    return out
  })
}

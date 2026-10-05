/** Path helpers for OpenList mount paths (always use forward slashes). */

export const ROOT = "/"

/** Collapse duplicate slashes and guarantee a leading slash. */
export const normalizePath = (path: string): string => {
  if (!path) return ROOT
  let p = path.replace(/\\/g, "/").replace(/\/+/g, "/")
  if (!p.startsWith("/")) p = `/${p}`
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "")
  return p || ROOT
}

export const joinPath = (...parts: string[]): string => {
  const joined = parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .join("/")
  return normalizePath(joined)
}

/** Parent directory of a path ("/" for top-level items). */
export const dirname = (path: string): string => {
  const p = normalizePath(path)
  if (p === ROOT) return ROOT
  const idx = p.lastIndexOf("/")
  return idx <= 0 ? ROOT : p.slice(0, idx)
}

export const basename = (path: string): string => {
  const p = normalizePath(path)
  if (p === ROOT) return ""
  return p.slice(p.lastIndexOf("/") + 1)
}

export interface Crumb {
  name: string
  path: string
}

/** Split "/a/b/c" into clickable crumbs: 全部文件 / a / b / c. */
export const toCrumbs = (path: string): Crumb[] => {
  const p = normalizePath(path)
  const crumbs: Crumb[] = [{ name: "全部文件", path: ROOT }]
  if (p === ROOT) return crumbs
  const segments = p.split("/").filter(Boolean)
  let acc = ""
  for (const seg of segments) {
    acc += `/${seg}`
    crumbs.push({ name: seg, path: acc })
  }
  return crumbs
}

/** Encode each path segment for use in a URL query/`File-Path` header. */
export const encodePath = (path: string): string =>
  normalizePath(path)
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")

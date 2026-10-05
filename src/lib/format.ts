/** Human-readable bytes. `-1`/`undefined` (unknown size) renders as an em dash. */
export const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[i]}`
}

/** Byte/second → "1.2 MB/s". */
export const formatSpeed = (bytesPerSecond?: number): string => {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ""
  return `${formatBytes(bytesPerSecond)}/s`
}

/** Remaining seconds → "1m 20s". */
export const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return ""
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const pad = (n: number) => String(n).padStart(2, "0")

/** ISO timestamp → "2026-09-28 21:03". Tolerates zero/invalid values. */
export const formatDate = (iso?: string, withTime = true): string => {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (!withTime) return date
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const formatDateShort = (iso?: string): string => formatDate(iso, false)

/** Relative "3 天前" label for the recently-modified view. */
export const formatRelative = (iso?: string): string => {
  if (!iso) return "—"
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return "—"
  const diff = Date.now() - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDateShort(iso)
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const pct = (value: number, total: number): number =>
  total <= 0 ? 0 : clamp((value / total) * 100, 0, 100)

/** Split text into a display name + extension for file-type hints. */
export const splitName = (name: string): { base: string; ext: string } => {
  const idx = name.lastIndexOf(".")
  if (idx <= 0 || idx === name.length - 1) return { base: name, ext: "" }
  return { base: name.slice(0, idx), ext: name.slice(idx + 1).toLowerCase() }
}

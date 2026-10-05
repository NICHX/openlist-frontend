import { ObjType, type Obj } from "@/api/types"
import { splitName } from "./format"

export type FileCategory =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "doc"
  | "archive"
  | "file"

const EXT: Record<string, FileCategory> = {}
const register = (cat: FileCategory, exts: string[]) => {
  for (const e of exts) EXT[e] = cat
}

register("image", ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "heic", "ico", "tiff"])
register("video", ["mp4", "mkv", "webm", "mov", "avi", "flv", "m4v", "ts", "rmvb", "wmv", "mpeg", "mpg"])
register("audio", ["mp3", "flac", "wav", "aac", "ogg", "m4a", "ape", "opus", "wma", "alac"])
register("text", ["txt", "md", "markdown", "log", "json", "yaml", "yml", "toml", "ini", "conf", "csv", "xml", "html", "css", "js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "c", "cpp", "h", "sh", "sql"])
// Media-library metadata: subtitles, chapter/playlist files and Kodi-style .nfo.
register("text", ["srt", "vtt", "ass", "ssa", "sub", "nfo", "lrc", "cue", "m3u", "m3u8", "pls"])
register("doc", ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "epub", "mobi", "rtf", "odt", "ods"])
register("archive", ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "tgz", "zst"])

/**
 * Resolve a file's category from the server-declared `ObjType` first (most
 * reliable) and fall back to the extension, then a generic "file".
 */
export const categoryOf = (obj: Pick<Obj, "name" | "is_dir" | "type">): FileCategory => {
  if (obj.is_dir) return "folder"
  switch (obj.type) {
    case ObjType.IMAGE:
      return "image"
    case ObjType.VIDEO:
      return "video"
    case ObjType.AUDIO:
      return "audio"
    case ObjType.TEXT:
      return "text"
    default:
      break
  }
  const { ext } = splitName(obj.name)
  return EXT[ext] ?? "file"
}

export const isPreviewable = (cat: FileCategory): boolean =>
  ["image", "video", "audio", "text", "doc"].includes(cat)

export const isTextLike = (cat: FileCategory): boolean => cat === "text"

import {
  File,
  FileArchive,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FileCategory } from "@/lib/filetype"

const ICONS: Record<FileCategory, LucideIcon> = {
  folder: Folder,
  image: ImageIcon,
  video: Film,
  audio: Music,
  text: FileText,
  doc: FileText,
  archive: FileArchive,
  file: File,
}

const LABELS: Record<FileCategory, string> = {
  folder: "文件夹",
  image: "图片",
  video: "视频",
  audio: "音频",
  text: "文本",
  doc: "文档",
  archive: "压缩包",
  file: "文件",
}

export const kindLabel = (category: FileCategory): string => LABELS[category]

interface FileTypeIconProps {
  category: FileCategory
  /** Optional thumbnail URL — rendered for images when available. */
  thumb?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZES = {
  sm: { box: "h-8 w-8 rounded-input", icon: "h-4 w-4" },
  md: { box: "h-9 w-9 rounded-[9px]", icon: "h-[19px] w-[19px]" },
  lg: { box: "h-[52px] w-[52px] rounded-[13px]", icon: "h-[26px] w-[26px]" },
} as const

/**
 * Type-coloured icon tile. Colour carries the folder/file semantic
 * (blue = folder, amber = file) while the glyph conveys the specific type, so
 * meaning never relies on colour alone.
 */
export function FileTypeIcon({ category, thumb, size = "md", className }: FileTypeIconProps) {
  const s = SIZES[size]
  const isFolder = category === "folder"

  if (thumb && category === "image") {
    return (
      <span className={cn("relative overflow-hidden bg-muted", s.box, className)}>
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      </span>
    )
  }

  const Icon = ICONS[category]
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        s.box,
        isFolder ? "bg-folder/[0.12] text-folder" : "bg-file/15 text-file",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={s.icon} strokeWidth={1.7} />
    </span>
  )
}

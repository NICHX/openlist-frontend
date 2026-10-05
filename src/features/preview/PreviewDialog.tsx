import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, List, Loader2, X } from "lucide-react"
import { useDirectoryList, useFileDetail } from "@/features/browse/hooks"
import type { Obj } from "@/api"
import { categoryOf, type FileCategory } from "@/lib/filetype"
import { formatBytes, splitName } from "@/lib/format"
import { openInNewTab, resolveRawUrl, toInlineUrl } from "@/lib/download"
import { fillExternalUrl, getExternalPreviews } from "@/lib/preview"
import { basename, dirname, joinPath } from "@/lib/path"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { kindLabel } from "@/features/browse/FileTypeIcon"

interface PreviewDialogProps {
  path: string | null
  onClose: () => void
  onDownload: (path: string, name: string) => void
}

const TEXT_LIMIT = 2 * 1024 * 1024

/** 可形成「连续播放」队列的类别（各自成列，不混播）。 */
const MEDIA: FileCategory[] = ["image", "video", "audio"]

/**
 * Unified preview lightbox. Fetches the file's direct link (`raw_url`) via
 * `/api/fs/get` and renders the appropriate native viewer. The whole parent
 * directory is listed and filtered to the current file's own category, so a
 * folder's images / videos / audio each become their own continuous playlist —
 * via the arrows, ←/→ keys, or by letting a track finish.
 */
export function PreviewDialog({ path, onClose, onDownload }: PreviewDialogProps) {
  // Internal cursor so navigation stays inside the lightbox without the parent
  // having to know about individual files.
  const [current, setCurrent] = useState<string | null>(path)
  const [autoplay, setAutoplay] = useState(false)

  // Re-sync whenever the parent opens a (new) file.
  useEffect(() => {
    setCurrent(path)
    setAutoplay(false)
  }, [path])

  const { data, isLoading } = useFileDetail(current)

  const detail = data?.code === 200 ? data.data : null
  const category: FileCategory = detail ? categoryOf(detail) : "file"
  const url = detail ? resolveRawUrl(detail.raw_url) : ""
  // 内联可播放地址（/p/），用于「拉起播放器」，避免 /d/ 触发下载。
  const inlineUrl = detail ? toInlineUrl(detail.raw_url) : ""
  const externalApps = useMemo(
    () => (detail ? getExternalPreviews(splitName(detail.name).ext) : []),
    [detail],
  )

  // 拉取当前文件所在目录的**全量**列表（per_page=0 表示不分页），保证列表完整。
  const dir = current ? dirname(current) : "/"
  const { data: dirData } = useDirectoryList(dir, { enabled: Boolean(current) })
  const siblings = useMemo<Obj[]>(
    () => (dirData?.code === 200 ? (dirData.data.content ?? []) : []),
    [dirData],
  )

  // 播放列表 = 同目录中与当前文件**同类别**的媒体文件（图片/视频/音频各自成列）。
  const playlist = useMemo<Obj[]>(() => {
    if (!current || !detail || !MEDIA.includes(category)) return []
    const name = basename(current)
    const list = siblings
      .filter((o) => !o.is_dir && categoryOf(o) === category)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "zh"))
    // 服务端列表若未含当前文件，补上以保证索引可用。
    if (!list.some((o) => o.name === name)) {
      list.push({
        name,
        size: detail.size,
        is_dir: false,
        created: detail.created,
        modified: detail.modified,
        thumb: detail.thumb,
        type: detail.type,
      })
      list.sort((a, b) => a.name.localeCompare(b.name, "zh"))
    }
    return list
  }, [current, detail, category, siblings])

  const index = current ? playlist.findIndex((o) => o.name === basename(current)) : -1
  const hasSiblings = playlist.length > 1
  const canPrev = hasSiblings && index > 0
  const canNext = hasSiblings && index >= 0 && index < playlist.length - 1

  const go = useCallback(
    (delta: number) => {
      if (!current || !hasSiblings || index < 0) return
      const next = index + delta
      if (next < 0 || next >= playlist.length) return
      setAutoplay(true)
      setCurrent(joinPath(dirname(current), playlist[next].name))
    },
    [current, hasSiblings, index, playlist],
  )

  const jumpTo = useCallback(
    (target: number) => {
      if (!current || target === index) return
      const item = playlist[target]
      if (!item) return
      setAutoplay(true)
      setCurrent(joinPath(dirname(current), item.name))
    },
    [current, index, playlist],
  )

  // ←/→ navigate the playlist. Ignore while typing or while the native media
  // controls own the arrow keys (seeking).
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "VIDEO" ||
      target.tagName === "AUDIO" ||
      target.isContentEditable
    ) {
      return
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      go(-1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      go(1)
    }
  }

  return (
    <Dialog open={Boolean(path)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="full"
        hideClose
        className="max-sm:w-[calc(100vw-16px)] max-sm:max-w-[calc(100vw-16px)] overflow-x-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{current ? basename(current) : path}</p>
            {detail && (
              <p className="tnum truncate text-xs text-subtle">
                {formatBytes(detail.size)} · {detail.modified ? detail.modified.slice(0, 10) : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {hasSiblings && (
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="max-md:h-9 max-md:w-9"
                  disabled={!canPrev}
                  onClick={() => go(-1)}
                  aria-label="上一个"
                  title="上一个"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 px-2 max-md:h-9"
                      aria-label="播放列表"
                      title="播放列表"
                    >
                      <List className="h-4 w-4" />
                      <span className="tnum hidden sm:inline">
                        {index + 1}/{playlist.length}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[60dvh] w-[min(80vw,260px)] overflow-y-auto">
                    <DropdownMenuLabel>
                      {kindLabel(category)} · 共 {playlist.length} 项
                    </DropdownMenuLabel>
                    {playlist.map((item, i) => (
                      <DropdownMenuItem
                        key={item.name}
                        onClick={() => jumpTo(i)}
                        className={cn(
                          "justify-between",
                          i === index && "bg-primary/[0.08] font-semibold text-primary",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate" title={item.name}>
                          {item.name}
                        </span>
                        <span className="tnum shrink-0 text-[11px] text-subtle">{formatBytes(item.size)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="max-md:h-9 max-md:w-9"
                  disabled={!canNext}
                  onClick={() => go(1)}
                  aria-label="下一个"
                  title="下一个"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            {detail && externalApps.length === 0 && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="max-md:h-9 max-md:w-9"
                onClick={() => openInNewTab(inlineUrl)}
                aria-label="拉起播放器"
                title="在新窗口打开（流媒体播放）"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {detail && externalApps.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="max-md:h-9 max-md:w-9"
                    aria-label="打开方式"
                    title="打开方式"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>打开方式</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => openInNewTab(inlineUrl)}>
                    <ExternalLink className="h-4 w-4" />
                    在新窗口打开
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {externalApps.map((app) => (
                    <DropdownMenuItem
                      key={app.name}
                      onClick={() =>
                        openInNewTab(
                          fillExternalUrl(app.url, { url: inlineUrl, durl: url, name: detail.name }),
                        )
                      }
                    >
                      {app.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {detail && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="max-md:h-9 max-md:w-9"
                onClick={() => onDownload(current as string, detail.name)}
                aria-label="下载"
                title="下载"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="max-md:h-9 max-md:w-9"
              onClick={onClose}
              aria-label="关闭"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-[240px] w-full items-center justify-center bg-bg p-3">
          {isLoading || !detail ? (
            <div className="flex flex-col items-center gap-3 py-16 text-subtle">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[13px]">正在加载预览…</span>
            </div>
          ) : data && data.code !== 200 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-subtle">
              <FileQuestion className="h-8 w-8" />
              <span className="text-[13px]">{data.message || "无法预览此文件"}</span>
            </div>
          ) : (
            <PreviewBody
              key={url}
              category={category}
              url={url}
              name={detail.name}
              size={detail.size}
              autoplay={autoplay}
              onEnded={() => canNext && go(1)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody({
  category,
  url,
  name,
  size,
  autoplay,
  onEnded,
}: {
  category: FileCategory
  url: string
  name: string
  size: number
  autoplay: boolean
  onEnded: () => void
}) {
  if (category === "image") {
    return (
      <img
        src={url}
        alt={name}
        className="h-auto max-h-[72dvh] w-auto max-w-full rounded-card object-contain"
        decoding="async"
      />
    )
  }

  if (category === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls
        playsInline
        autoPlay={autoplay}
        onEnded={onEnded}
        className="max-h-[72dvh] w-full max-w-full rounded-card bg-black"
      />
    )
  }

  if (category === "audio") {
    return (
      <div className="w-full max-w-[560px] rounded-card border border-border bg-surface p-6">
        <p className="mb-4 truncate text-center text-sm font-semibold">{name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls autoPlay={autoplay} onEnded={onEnded} className="w-full" />
      </div>
    )
  }

  if (category === "doc") {
    const isPdf = name.toLowerCase().endsWith(".pdf")
    if (isPdf) {
      return (
        <iframe
          src={url}
          title={name}
          className="h-[72dvh] w-full rounded-card border border-border bg-surface"
        />
      )
    }
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-subtle">
        <FileQuestion className="h-8 w-8" />
        <span className="text-[13px]">该文档类型暂不支持在线预览，请下载后查看</span>
      </div>
    )
  }

  if (category === "text") {
    return <TextPreview url={url} size={size} />
  }

  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-subtle">
      <FileQuestion className="h-8 w-8" />
      <span className="text-[13px]">暂不支持预览此类型文件</span>
    </div>
  )
}

function TextPreview({ url, size }: { url: string; size: number }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (size > TEXT_LIMIT) {
      setError(true)
      return
    }
    setContent(null)
    setError(false)
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => !cancelled && setContent(text))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [url, size])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-subtle">
        <FileQuestion className="h-8 w-8" />
        <span className="text-[13px]">
          {size > TEXT_LIMIT ? "文件过大，请下载后查看" : "读取文件失败"}
        </span>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-subtle">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-[13px]">正在读取…</span>
      </div>
    )
  }

  return (
    <pre className="max-h-[72dvh] w-full overflow-auto rounded-card border border-border bg-surface p-4 text-left text-[13px] leading-relaxed">
      <code>{content}</code>
    </pre>
  )
}

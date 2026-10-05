import { useEffect, useState } from "react"
import { Download, FileQuestion, Loader2 } from "lucide-react"
import { useFileDetail } from "@/features/browse/hooks"
import { categoryOf, type FileCategory } from "@/lib/filetype"
import { formatBytes } from "@/lib/format"
import { resolveRawUrl } from "@/lib/download"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface PreviewDialogProps {
  path: string | null
  onClose: () => void
  onDownload: (path: string, name: string) => void
}

const TEXT_LIMIT = 2 * 1024 * 1024

/**
 * Unified preview lightbox. Fetches the file's direct link (`raw_url`) via
 * `/api/fs/get` and renders the appropriate native viewer.
 */
export function PreviewDialog({ path, onClose, onDownload }: PreviewDialogProps) {
  const { data, isLoading } = useFileDetail(path)

  const detail = data?.code === 200 ? data.data : null
  const category: FileCategory = detail ? categoryOf(detail) : "file"
  const url = detail ? resolveRawUrl(detail.raw_url) : ""

  return (
    <Dialog open={Boolean(path)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="full" hideClose className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{detail?.name ?? path}</p>
            {detail && (
              <p className="tnum text-xs text-subtle">
                {formatBytes(detail.size)} · {detail.modified ? detail.modified.slice(0, 10) : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownload(path as string, detail.name)}
              >
                <Download className="h-4 w-4" />
                下载
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>

        <div className="grid min-h-[300px] place-items-center bg-bg p-3">
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
            <PreviewBody category={category} url={url} name={detail.name} size={detail.size} />
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
}: {
  category: FileCategory
  url: string
  name: string
  size: number
}) {
  if (category === "image") {
    return (
      <img
        src={url}
        alt={name}
        className="max-h-[72dvh] max-w-full rounded-card object-contain"
        decoding="async"
      />
    )
  }

  if (category === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} controls playsInline className="max-h-[72dvh] w-full max-w-[900px] rounded-card bg-black" />
    )
  }

  if (category === "audio") {
    return (
      <div className="w-full max-w-[560px] rounded-card border border-border bg-surface p-6">
        <p className="mb-4 truncate text-center text-sm font-semibold">{name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls className="w-full" />
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

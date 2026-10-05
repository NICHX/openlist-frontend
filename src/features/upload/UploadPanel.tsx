import { AlertCircle, CheckCircle2, ChevronDown, Loader2, RotateCw, Trash2, X, XCircle } from "lucide-react"
import { formatBytes, formatSpeed } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { activeTaskCount, useUploadStore, type UploadTask } from "@/stores/upload"
import type { UploadStatus } from "@/features/upload/uploader"

const STATUS_TEXT: Record<UploadStatus, string> = {
  pending: "排队中",
  hashing: "计算哈希…",
  uploading: "上传中",
  backending: "服务器处理中…",
  success: "已完成",
  error: "失败",
  canceled: "已取消",
}

function StatusIcon({ status }: { status: UploadStatus }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive-text" />
    case "canceled":
      return <XCircle className="h-4 w-4 text-subtle" />
    case "pending":
      return <Loader2 className="h-4 w-4 text-subtle" />
    default:
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
  }
}

export function UploadPanel() {
  const panelOpen = useUploadStore((s) => s.panelOpen)
  const setPanelOpen = useUploadStore((s) => s.setPanelOpen)
  const tasks = useUploadStore((s) => s.tasks)
  const retry = useUploadStore((s) => s.retry)
  const retryAllFailed = useUploadStore((s) => s.retryAllFailed)
  const cancel = useUploadStore((s) => s.cancel)
  const remove = useUploadStore((s) => s.remove)
  const clearFinished = useUploadStore((s) => s.clearFinished)

  if (tasks.length === 0) return null

  const running = activeTaskCount(tasks)
  const failures = tasks.filter((t) => t.status === "error").length
  const finished = tasks.filter((t) => t.status === "success" || t.status === "canceled").length

  return (
    <section
      aria-label="传输列表"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-border bg-surface shadow-2xl transition-transform duration-200 ease-ui",
        "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px] sm:rounded-card sm:border",
        "max-h-[70dvh]",
        panelOpen ? "translate-y-0" : "translate-y-[calc(100%-56px)] sm:translate-y-[calc(100%-56px)]",
      )}
    >
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="flex min-h-[56px] shrink-0 items-center gap-3 px-4 text-left"
        aria-expanded={panelOpen}
      >
        <span className="grid h-8 w-8 place-items-center rounded-input bg-primary/[0.12] text-primary">
          {running > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">传输列表</span>
          <span className="block text-[12px] text-subtle">
            {running > 0 ? `${running} 项进行中` : "全部完成"} · 共 {tasks.length} 项
            {failures > 0 ? ` · ${failures} 项失败` : ""}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-subtle transition-transform", panelOpen && "rotate-180")} />
      </button>

      {panelOpen && (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} onRetry={retry} onCancel={cancel} onRemove={remove} />
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
            {failures > 0 && (
              <Button size="sm" variant="outline" onClick={retryAllFailed}>
                <RotateCw className="h-4 w-4" />
                重试失败项
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={finished === 0} onClick={clearFinished}>
              <Trash2 className="h-4 w-4" />
              清除已完成
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setPanelOpen(false)}
              aria-label="收起"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function TaskRow({
  task,
  onRetry,
  onCancel,
  onRemove,
}: {
  task: UploadTask
  onRetry: (id: string) => void
  onCancel: (id: string) => void
  onRemove: (id: string) => void
}) {
  const inProgress = ["uploading", "hashing", "backending", "pending"].includes(task.status)

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0">
        <StatusIcon status={task.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-medium" title={task.relPath}>
            {task.relPath}
          </p>
          <span className="tnum shrink-0 text-[11px] text-subtle">
            {task.status === "success" ? formatBytes(task.size) : `${task.progress}%`}
          </span>
        </div>

        <div className="mt-1.5">
          <Progress
            value={task.progress}
            indicatorClassName={task.status === "error" ? "bg-destructive" : undefined}
          />
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-subtle">
          <span>{STATUS_TEXT[task.status]}</span>
          {task.speed > 0 && <span className="tnum">· {formatSpeed(task.speed)}</span>}
          {task.error && <span className="truncate text-destructive-text">· {task.error}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {task.status === "error" && (
          <Button size="icon-sm" variant="ghost" onClick={() => onRetry(task.id)} aria-label="重试">
            <RotateCw className="h-4 w-4" />
          </Button>
        )}
        {inProgress ? (
          <Button size="icon-sm" variant="ghost" onClick={() => onCancel(task.id)} aria-label="取消">
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" onClick={() => onRemove(task.id)} aria-label="移除">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  )
}

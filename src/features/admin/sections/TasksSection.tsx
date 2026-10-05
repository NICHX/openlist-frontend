import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RotateCcw, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { TASK_STATE_LABELS, TASK_TYPES, type TaskInfo, type TaskTypeKey } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate } from "@/lib/format"
import { AdminEmpty, AdminError, AdminLoading, AdminRow, AdminSection, ConfirmDialog } from "../ui"

const FAILED_STATES = new Set([3, 4, 8])
const isFailed = (state: number) => FAILED_STATES.has(state)

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-primary bg-primary/[0.12] text-primary"
          : "border-border bg-surface text-subtle hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

type ConfirmTarget =
  | { kind: "cancel"; task: TaskInfo }
  | { kind: "delete"; task: TaskInfo }
  | { kind: "clearDone" }
  | { kind: "retryFailed" }

export function TasksSection() {
  const qc = useQueryClient()
  const [type, setType] = useState<TaskTypeKey>("upload")
  const [done, setDone] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null)

  const query = useQuery({
    queryKey: ["admin", "task", type, done],
    queryFn: () => adminApi.taskList(type, done),
    retry: false,
    refetchInterval: done ? false : 3000,
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin", "task"] })

  const cancelMutation = useMutation({
    mutationFn: (tid: string) => adminApi.taskCancel(type, tid).then(unwrap),
    onSuccess: () => {
      toast.success("已取消任务")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "取消失败"),
  })
  const deleteMutation = useMutation({
    mutationFn: (tid: string) => adminApi.taskDelete(type, tid).then(unwrap),
    onSuccess: () => {
      toast.success("已删除任务")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  })
  const retryMutation = useMutation({
    mutationFn: (tid: string) => adminApi.taskRetry(type, tid).then(unwrap),
    onSuccess: () => {
      toast.success("已提交重试")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "重试失败"),
  })
  const clearDoneMutation = useMutation({
    mutationFn: () => adminApi.taskClearDone(type).then(unwrap),
    onSuccess: () => {
      toast.success("已清除已完成任务")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "清除失败"),
  })
  const retryFailedMutation = useMutation({
    mutationFn: () => adminApi.taskRetryFailed(type).then(unwrap),
    onSuccess: () => {
      toast.success("已提交重试全部失败任务")
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "重试失败"),
  })

  const resp = query.data
  const tasks = resp && resp.code === 200 ? resp.data ?? [] : []
  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : resp && resp.code !== 200
        ? resp.message
        : ""

  const handleConfirm = () => {
    if (!confirm) return
    if (confirm.kind === "cancel") {
      cancelMutation.mutate(confirm.task.id, { onSuccess: () => setConfirm(null) })
    } else if (confirm.kind === "delete") {
      deleteMutation.mutate(confirm.task.id, { onSuccess: () => setConfirm(null) })
    } else if (confirm.kind === "clearDone") {
      clearDoneMutation.mutate(undefined, { onSuccess: () => setConfirm(null) })
    } else {
      retryFailedMutation.mutate(undefined, { onSuccess: () => setConfirm(null) })
    }
  }

  const pending = confirm
    ? confirm.kind === "cancel"
      ? cancelMutation.isPending
      : confirm.kind === "delete"
        ? deleteMutation.isPending
        : confirm.kind === "clearDone"
          ? clearDoneMutation.isPending
          : retryFailedMutation.isPending
    : false

  let dialogTitle = ""
  let dialogDescription = ""
  let dialogLabel = "确认"
  let dialogDestructive = false
  if (confirm?.kind === "cancel") {
    dialogTitle = "取消任务"
    dialogDescription = `确定要取消任务「${confirm.task.name}」吗？`
    dialogLabel = "取消任务"
  } else if (confirm?.kind === "delete") {
    dialogTitle = "删除任务"
    dialogDescription = `确定要删除任务「${confirm.task.name}」吗？此操作不可撤销。`
    dialogLabel = "删除"
    dialogDestructive = true
  } else if (confirm?.kind === "clearDone") {
    dialogTitle = done ? "清空已完成" : "清除已完成"
    dialogDescription = "确定要清除当前类型的全部已完成任务记录吗？"
    dialogLabel = "清除"
    dialogDestructive = true
  } else if (confirm?.kind === "retryFailed") {
    dialogTitle = "重试所有失败任务"
    dialogDescription = "确定要重试当前类型下的所有失败任务吗？"
    dialogLabel = "重试"
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {TASK_TYPES.map((item) => (
            <Chip key={item.key} active={type === item.key} onClick={() => setType(item.key)}>
              {item.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <Chip active={!done} onClick={() => setDone(false)}>
            进行中
          </Chip>
          <Chip active={done} onClick={() => setDone(true)}>
            已完成
          </Chip>
        </div>
      </div>

      <AdminSection
        title="任务队列"
        description={resp && resp.code === 200 ? `共 ${tasks.length} 项` : undefined}
        actions={
          <>
            {!done && (
              <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "retryFailed" })}>
                重试所有失败
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "clearDone" })}>
              {done ? "清空已完成" : "清除已完成"}
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        {query.isLoading ? (
          <AdminLoading rows={3} />
        ) : errorMessage ? (
          <AdminError message={errorMessage} onRetry={() => void query.refetch()} />
        ) : tasks.length === 0 ? (
          <AdminEmpty message={done ? "暂无已完成任务" : "暂无进行中的任务"} />
        ) : (
          <div>
            {tasks.map((task) => {
              const label = TASK_STATE_LABELS[task.state] ?? task.status
              const retrying = retryMutation.isPending && retryMutation.variables === task.id
              return (
                <AdminRow key={task.id}>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" title={task.name}>
                      {task.name || "未命名任务"}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-subtle">
                      <span className="truncate">{task.creator || "未知用户"}</span>
                      <span>{label}</span>
                      <span className="tnum">{formatBytes(task.total_bytes)}</span>
                      <span className="tnum">{formatDate(task.start_time ?? undefined)}</span>
                    </div>
                    <Progress className="mt-1.5" value={task.progress} />
                    {task.error && (
                      <p className="mt-1 text-[11px] text-destructive-text">{task.error}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!done ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="取消任务"
                          onClick={() => setConfirm({ kind: "cancel", task })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        {(task.error !== "" || isFailed(task.state)) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="重试任务"
                            disabled={retrying}
                            onClick={() => retryMutation.mutate(task.id)}
                          >
                            <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="重试任务"
                          disabled={retrying}
                          onClick={() => retryMutation.mutate(task.id)}
                        >
                          <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除任务"
                          onClick={() => setConfirm({ kind: "delete", task })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </AdminRow>
              )
            })}
          </div>
        )}
      </AdminSection>

      <ConfirmDialog
        open={confirm !== null}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={dialogLabel}
        destructive={dialogDestructive}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}

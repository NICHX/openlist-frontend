import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** 管理后台区块：卡片头（标题 + 右侧操作）+ 内容。 */
export function AdminSection({
  title,
  description,
  actions,
  children,
  bodyClassName,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  bodyClassName?: string
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] text-subtle">{description}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

/** 列表行容器（分隔线 + 内边距）。 */
export function AdminRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
        onClick && "cursor-pointer transition-colors hover:bg-muted",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function AdminEmpty({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-[13px] text-subtle">{message}</p>
      {action}
    </div>
  )
}

export function AdminLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-input" />
      ))}
    </div>
  )
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-5 text-[13px] text-destructive-text">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message || "请求失败，请稍后重试"}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}

/** 状态徽标。 */
export function StatusBadge({
  ok,
  okText = "已启用",
  badText = "已禁用",
}: {
  ok: boolean
  okText?: string
  badText?: string
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-muted text-subtle",
      )}
    >
      {ok ? okText : badText}
    </span>
  )
}

/** 状态点。 */
export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-border")} />
}

/** 表单字段（可见 label + 可选帮助文本）。 */
export function FormField({
  label,
  help,
  htmlFor,
  required,
  children,
  className,
}: {
  label: string
  help?: string
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-semibold">
        {label}
        {required && <span className="text-destructive-text">*</span>}
      </label>
      {children}
      {help && <p className="text-[11px] leading-relaxed text-subtle">{help}</p>}
    </div>
  )
}

/** 表单两列栅格。 */
export function AdminGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div>
}

/** 提示条。 */
export function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-card border border-border bg-muted/40 px-4 py-3 text-[12px] leading-relaxed text-subtle">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** 通用二次确认弹窗（删除、禁用等）。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  destructive = false,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 表格化列表：自带表头与横向滚动，用于行数较多的模块。 */
export function AdminTable({
  head,
  children,
}: {
  head: (string | React.ReactNode)[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-subtle">
          {head.map((cell, i) => (
            <span key={i} className="flex-1 last:flex-none">
              {cell}
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}

/** 表格行。 */
export function AdminTableRow({
  cells,
  actions,
}: {
  cells: React.ReactNode[]
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      {cells.map((cell, i) => (
        <span key={i} className="min-w-0 flex-1">
          {cell}
        </span>
      ))}
      {actions && <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </div>
  )
}

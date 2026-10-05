import { useQueries, useQuery } from "@tanstack/react-query"
import { ArrowRight, Database, HardDrive, ListChecks, RefreshCw, Users } from "lucide-react"
import { adminApi } from "@/api"
import { TASK_TYPES } from "@/api/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSetting } from "@/stores/settings"
import { AdminError, AdminLoading, AdminRow, AdminSection, StatusBadge, StatusDot } from "../ui"

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "default" | "primary"
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-subtle">
        {icon}
        {label}
      </p>
      <p className={cn("tnum mt-1 text-xl font-bold", tone === "primary" && "text-primary")}>{value}</p>
      {hint && <p className="text-[11px] text-subtle">{hint}</p>}
    </div>
  )
}

export function DashboardSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  const storages = useQuery({
    queryKey: ["admin", "storage"],
    queryFn: () => adminApi.storageList(),
    retry: false,
  })
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.userList(),
    retry: false,
  })
  const index = useQuery({
    queryKey: ["admin", "index", "progress"],
    queryFn: () => adminApi.indexProgress(),
    retry: false,
    refetchInterval: 5000,
  })
  const taskQueries = useQueries({
    queries: TASK_TYPES.map((t) => ({
      queryKey: ["admin", "task", t.key, false],
      queryFn: () => adminApi.taskList(t.key, false),
      retry: false,
    })),
  })

  const storageItems = storages.data?.code === 200 ? (storages.data.data.content ?? []) : []
  const userItems = users.data?.code === 200 ? (users.data.data.content ?? []) : []
  const enabled = storageItems.filter((s) => !s.disabled).length
  const runningTasks = taskQueries.reduce(
    (sum, q) => sum + (q.data?.code === 200 ? (q.data.data ?? []).length : 0),
    0,
  )
  const loading = storages.isLoading || users.isLoading
  const firstError =
    (storages.data && storages.data.code !== 200 && storages.data.message) ||
    (users.data && users.data.code !== 200 && users.data.message) ||
    ""

  const indexState = (() => {
    const data = index.data?.code === 200 ? index.data.data : null
    if (!data) return null
    const progress = typeof data.progress === "number" ? data.progress : null
    const state = typeof data.state === "string" ? data.state : ""
    return { progress, state }
  })()

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="存储"
          value={loading ? "…" : String(storageItems.length)}
          hint={storageItems.length ? `${enabled} 启用 / ${storageItems.length - enabled} 禁用` : "暂无存储"}
        />
        <StatCard icon={<Users className="h-4 w-4" />} label="用户" value={loading ? "…" : String(userItems.length)} />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          label="进行中任务"
          value={String(runningTasks)}
          tone={runningTasks > 0 ? "primary" : "default"}
          hint={runningTasks > 0 ? "有任务正在执行" : "队列空闲"}
        />
        <StatCard
          icon={<Database className="h-4 w-4" />}
          label="搜索索引"
          value={index.isLoading ? "…" : indexState?.progress != null ? `${Math.round(indexState.progress)}%` : "就绪"}
          hint={indexState?.state || "未在索引"}
        />
      </div>

      <AdminSection
        title="存储状态"
        actions={
          <>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void storages.refetch()}>
              <RefreshCw className={cn("h-4 w-4", storages.isFetching && "animate-spin")} />
              刷新
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onNavigate("storages")}>
              管理存储
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        {loading ? (
          <AdminLoading rows={3} />
        ) : firstError ? (
          <AdminError message={firstError} onRetry={() => void storages.refetch()} />
        ) : storageItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-subtle">还没有配置任何存储</p>
        ) : (
          <div>
            {storageItems.map((item) => (
              <AdminRow key={item.id}>
                <StatusDot ok={!item.disabled} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{item.mount_path}</span>
                  <span className="block truncate text-[11px] text-subtle">
                    {item.driver}
                    {item.remark ? ` · ${item.remark}` : ""}
                  </span>
                </span>
                <StatusBadge ok={!item.disabled} />
              </AdminRow>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="快捷操作">
        <div className="flex flex-wrap gap-2 p-4">
          {[
            { key: "storages", label: "管理存储" },
            { key: "users", label: "管理用户" },
            { key: "settings", label: "站点设置" },
            { key: "tasks", label: "任务队列" },
            { key: "indexes", label: "搜索索引" },
            { key: "shares", label: "分享链接" },
            { key: "metas", label: "元信息" },
          ].map((action) => (
            <Button key={action.key} variant="outline" size="sm" onClick={() => onNavigate(action.key)}>
              {action.label}
            </Button>
          ))}
        </div>
      </AdminSection>

      <p className="text-[11px] text-subtle">当前版本：{getSetting("version", "未知")}</p>
    </div>
  )
}

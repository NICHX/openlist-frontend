import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Play, RefreshCw, Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { AdminError, AdminLoading, AdminSection, ConfirmDialog, FormField, SectionNote } from "../ui"
import { tSetting, tSettingOption } from "../i18n"

/** 未启用索引时，服务端所有 /admin/index/* 接口都会返回这句话。 */
const NOT_AVAILABLE = /search not available|not available/i

const SEARCH_INDEX_FALLBACK_OPTIONS = ["none", "database", "database_non_full_text", "meilisearch", "bleve"]

function formatValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatValue(item)).filter((item): item is string => item != null)
    return parts.length > 0 ? parts.join(", ") : null
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function IndexSection() {
  const [paths, setPaths] = useState("/")
  const [maxDepth, setMaxDepth] = useState("-1")
  const [confirmClear, setConfirmClear] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [initialized, setInitialized] = useState(false)

  const progress = useQuery({
    queryKey: ["admin", "index", "progress"],
    queryFn: () => adminApi.indexProgress(),
    retry: false,
    refetchInterval: 3000,
  })

  // 读取索引相关设置（不带 group 取全部，避免服务端分组差异）
  const settingsQuery = useQuery({
    queryKey: ["admin", "settings", "index-keys"],
    queryFn: () => adminApi.settingList(),
    retry: false,
  })

  const items = settingsQuery.data?.code === 200 ? (settingsQuery.data.data ?? []) : []
  const searchIndexItem = items.find((item) => item.key === "search_index")
  const allowIndexedItem = items.find((item) => item.key === "allow_indexed")

  useEffect(() => {
    if (initialized || items.length === 0) return
    const next: Record<string, string> = {}
    for (const key of ["search_index", "allow_indexed"]) {
      const item = items.find((entry) => entry.key === key)
      if (item) next[key] = item.value
    }
    setDraft(next)
    setInitialized(true)
  }, [items, initialized])

  const currentEngine = draft.search_index ?? searchIndexItem?.value ?? ""
  const indexEnabled = currentEngine !== "" && currentEngine !== "none"
  const engineOptions =
    searchIndexItem?.options && searchIndexItem.options.trim() !== ""
      ? searchIndexItem.options.split(",").map((option) => option.trim()).filter(Boolean)
      : SEARCH_INDEX_FALLBACK_OPTIONS

  const dirtyChanges = Object.entries(draft)
    .filter(([key, value]) => {
      const original = items.find((item) => item.key === key)?.value
      return original !== undefined && original !== value
    })
    .map(([key, value]) => ({ key, value }))

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (dirtyChanges.length === 0) return
      unwrap(await adminApi.settingSave(dirtyChanges))
    },
    onSuccess: () => {
      toast.success(indexEnabled ? "索引设置已保存，可以开始构建索引了" : "索引设置已保存")
      void settingsQuery.refetch()
      void progress.refetch()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
  })

  const parsePaths = (): string[] => {
    const list = paths
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    return list.length > 0 ? list : ["/"]
  }
  const parseDepth = (): number => {
    const value = Number.parseInt(maxDepth, 10)
    return Number.isFinite(value) ? value : -1
  }

  const build = useMutation({
    mutationFn: async (vars: { paths: string[]; maxDepth: number }) =>
      unwrap(await adminApi.indexBuild(vars.paths, vars.maxDepth)),
    onSuccess: () => {
      toast.success("已开始构建索引")
      void progress.refetch()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "构建索引失败"),
  })

  const update = useMutation({
    mutationFn: async (vars: { paths: string[]; maxDepth: number }) =>
      unwrap(await adminApi.indexUpdate(vars.paths, vars.maxDepth)),
    onSuccess: () => {
      toast.success("已开始更新索引")
      void progress.refetch()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新索引失败"),
  })

  const stop = useMutation({
    mutationFn: async () => unwrap(await adminApi.indexStop()),
    onSuccess: () => {
      toast.success("已请求停止索引")
      void progress.refetch()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "停止索引失败"),
  })

  const clear = useMutation({
    mutationFn: async () => unwrap(await adminApi.indexClear()),
    onSuccess: () => {
      toast.success("已清除索引")
      setConfirmClear(false)
      void progress.refetch()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "清除索引失败"),
  })

  const data = progress.data?.code === 200 ? progress.data.data : null
  const state = data && typeof data.state === "string" ? data.state : ""
  const progressError = progress.data && progress.data.code !== 200 ? progress.data.message : ""
  const indexUnavailable = !indexEnabled || NOT_AVAILABLE.test(progressError)

  const rawProgress = data?.progress
  let percent: number | null = null
  if (typeof rawProgress === "number" && Number.isFinite(rawProgress)) {
    const scaled = rawProgress > 0 && rawProgress < 1 ? rawProgress * 100 : rawProgress
    percent = Math.max(0, Math.min(100, Math.round(scaled)))
  }

  // OpenList 的进度体是 { obj_count, is_done, error }，没有百分比字段，
  // 因此用 is_done + obj_count 推断「索引中 / 已完成 / 未建立」。
  const objCount = data && typeof data.obj_count === "number" ? data.obj_count : null
  const isDone = data?.is_done === true
  const errorText = data && typeof data.error === "string" ? data.error : ""
  const busy = !isDone && (objCount ?? 0) > 0
  const statusLabel = state
    ? state
    : errorText
      ? "出错"
      : isDone
        ? "已完成"
        : busy
          ? "索引中…"
          : objCount === 0
            ? "尚未建立索引"
            : "空闲"

  const FORMATTED_KEYS = ["progress", "state", "obj_count", "is_done", "error"]
  const extras: [string, string][] = data
    ? Object.entries(data)
        .filter(([key]) => !FORMATTED_KEYS.includes(key))
        .map(([key, value]): [string, string | null] => [key, formatValue(value)])
        .filter((entry): entry is [string, string] => entry[1] != null)
    : []

  return (
    <div className="space-y-4">
      {/* 索引引擎：搜索索引必须先启用，否则后面所有按钮都会返回 search not available */}
      <AdminSection
        title="索引引擎"
        description="搜索索引需先在服务端启用；未启用时构建/更新等接口都会返回 search not available"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            disabled={dirtyChanges.length === 0 || saveSettings.isPending}
            onClick={() => saveSettings.mutate()}
          >
            {saveSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        }
      >
        {settingsQuery.isLoading ? (
          <AdminLoading rows={2} />
        ) : settingsQuery.data && settingsQuery.data.code !== 200 ? (
          <AdminError
            message={settingsQuery.data.message || "加载索引设置失败"}
            onRetry={() => void settingsQuery.refetch()}
          />
        ) : (
          <div className="space-y-3 p-4">
            {!indexEnabled && (
              <p className="flex items-start gap-2 rounded-card border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] leading-relaxed text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  当前未启用搜索索引（值为 <code className="rounded bg-muted px-1">{currentEngine || "空"}</code>
                  ），因此构建索引会失败。请把下方「搜索索引」改为 <b>数据库</b>（或 Meilisearch / Bleve）后点「保存」，
                  再回到下面的「构建参数」执行构建。
                </span>
              </p>
            )}
            <FormField
              label={tSetting("search_index")}
              help="选择索引后端。「无」表示关闭搜索功能；启用后需建立索引才能搜到内容。"
            >
              <select
                value={currentEngine}
                onChange={(e) => setDraft((prev) => ({ ...prev, search_index: e.target.value }))}
                className="h-9 w-full rounded-input border border-border bg-surface px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 max-md:h-11"
              >
                {engineOptions.map((option) => (
                  <option key={option} value={option}>
                    {tSettingOption("search_index", option)}
                  </option>
                ))}
              </select>
            </FormField>

            {allowIndexedItem && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{tSetting("allow_indexed")}</p>
                  <p className="text-[11px] text-subtle">允许对存储建立索引（本地存储等驱动需要）</p>
                </div>
                <Switch
                  checked={(draft.allow_indexed ?? allowIndexedItem.value) === "true"}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({ ...prev, allow_indexed: checked ? "true" : "false" }))
                  }
                  aria-label={tSetting("allow_indexed")}
                />
              </div>
            )}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="搜索索引"
        description="索引进度与状态，每 3 秒自动刷新"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void progress.refetch()}>
            <RefreshCw className={cn("h-4 w-4", progress.isFetching && "animate-spin")} />
            刷新
          </Button>
        }
      >
        {progress.isLoading ? (
          <AdminLoading rows={2} />
        ) : progress.data && progress.data.code !== 200 ? (
          <div className="space-y-2">
            <AdminError
              message={progress.data.message || "加载索引进度失败"}
              onRetry={() => void progress.refetch()}
            />
            {indexUnavailable && (
              <p className="px-4 pb-4 text-[12px] text-subtle">
                提示：这通常是因为上面的「搜索索引」尚未启用，请先在上方保存索引引擎，再点「刷新」。
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-semibold">索引进度</span>
              <span className="tnum text-subtle">{percent != null ? `${percent}%` : "—"}</span>
            </div>
            {percent != null ? (
              <Progress value={percent} />
            ) : (
              <div
                className={cn("h-2 w-full rounded-full", busy ? "animate-pulse bg-primary/25" : "bg-muted")}
                role="progressbar"
                aria-label="索引进度"
              />
            )}
            <p className="text-[12px] text-subtle">
              状态：{statusLabel}
              {objCount != null && objCount > 0 && (
                <>
                  {" · "}
                  <span className="tnum">已索引 {objCount.toLocaleString("zh-CN")} 项</span>
                </>
              )}
            </p>
            {errorText && <p className="text-[12px] text-destructive-text">错误：{errorText}</p>}
            {extras.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-subtle">
                {extras.map(([key, text]) => (
                  <span key={key} className="truncate">
                    {key}: {text}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </AdminSection>

      <AdminSection title="构建参数">
        <div className="space-y-3 p-4">
          <FormField label="路径" htmlFor="index-paths" help="以英文逗号分隔多个路径，默认 /">
            <Input id="index-paths" value={paths} placeholder="/" onChange={(e) => setPaths(e.target.value)} />
          </FormField>
          <FormField label="最大深度" htmlFor="index-depth" help="默认 -1，表示不限深度">
            <Input
              id="index-depth"
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              disabled={build.isPending || indexUnavailable}
              title={indexUnavailable ? "请先在上方启用搜索索引" : undefined}
              onClick={() => build.mutate({ paths: parsePaths(), maxDepth: parseDepth() })}
            >
              {build.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              构建索引
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={update.isPending || indexUnavailable}
              title={indexUnavailable ? "请先在上方启用搜索索引" : undefined}
              onClick={() => update.mutate({ paths: parsePaths(), maxDepth: parseDepth() })}
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              更新索引
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={stop.isPending || !indexEnabled}
              onClick={() => stop.mutate()}
            >
              {stop.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              停止
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive-text hover:text-destructive-text"
              disabled={clear.isPending || indexUnavailable}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="h-4 w-4" />
              清除索引
            </Button>
          </div>
        </div>
      </AdminSection>

      <SectionNote>
        搜索功能依赖索引：需要先在「索引引擎」里启用（选择 数据库 / Meilisearch / Bleve 并保存），
        再到「构建参数」执行构建；索引为空或未构建时，搜索会提示 search not available 或结果不完整。
      </SectionNote>

      <ConfirmDialog
        open={confirmClear}
        title="清除索引"
        description="清除后搜索功能将不可用，直到重新建立索引。确定要清除吗？"
        confirmLabel="清除"
        destructive
        pending={clear.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => clear.mutate()}
      />
    </div>
  )
}

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { Flag, Group, GROUP_LABELS, Type, type SettingItem } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/stores/settings"
import { tSetting, tSettingOption, tSettingTip } from "../i18n"
import {
  AdminEmpty,
  AdminError,
  AdminGrid,
  AdminLoading,
  AdminSection,
  ConfirmDialog,
  FormField,
} from "../ui"

const controlClass =
  "flex h-9 w-full rounded-input border border-border bg-surface px-3 text-sm text-foreground transition-colors duration-150 ease-ui placeholder:text-subtle/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11"

const textareaClass =
  "flex min-h-[92px] w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-150 ease-ui placeholder:text-subtle/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"

const toMap = (items: SettingItem[]): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const item of items) map[item.key] = item.value
  return map
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "操作失败")

export function SettingsSection() {
  const qc = useQueryClient()
  const [group, setGroup] = useState<number>(Group.SITE)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<SettingItem | null>(null)

  const query = useQuery({
    queryKey: ["admin", "settings", group],
    queryFn: () => adminApi.settingList(group),
    retry: false,
  })

  const data = query.data
  const items = data?.code === 200 ? (data.data ?? []) : []

  useEffect(() => {
    if (data?.code === 200) {
      const map = toMap(data.data ?? [])
      setOriginal(map)
      setDraft(map)
    }
  }, [data])

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "settings", group] })

  const saveMutation = useMutation({
    mutationFn: (payload: { key: string; value: string }[]) =>
      adminApi.settingSave(payload).then(unwrap),
    onSuccess: () => {
      toast.success("设置已保存")
      void invalidate()
      void useSettingsStore.getState().load(true)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const defaultMutation = useMutation({
    mutationFn: (g: number) => adminApi.settingDefault(g).then(unwrap),
    onSuccess: (list) => {
      const map = toMap(list)
      setOriginal(map)
      setDraft(map)
      toast.success("已载入默认值")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => adminApi.settingDelete(key).then(unwrap),
    onSuccess: () => {
      toast.success("已删除该设置项")
      setDeleteTarget(null)
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const modified = items.filter((item) => draft[item.key] !== original[item.key])

  const update = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }))

  const handleSave = () => {
    if (modified.length === 0) return
    saveMutation.mutate(modified.map((item) => ({ key: item.key, value: draft[item.key] ?? "" })))
  }

  const renderField = (item: SettingItem) => {
    const id = `setting-${item.key}`
    const disabled = item.flag === Flag.READONLY
    const value = draft[item.key] ?? ""
    const onChange = (next: string) => update(item.key, next)

    let control: React.ReactNode
    switch (item.type) {
      case Type.Bool:
        control = (
          <Switch
            id={id}
            checked={value === "true"}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
          />
        )
        break
      case Type.Select:
        control = (
          <select
            id={id}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={controlClass}
          >
            {(item.options ?? "").split(",").map((option, i) => (
              <option key={`${option}-${i}`} value={option}>
                {tSettingOption(item.key, option)}
              </option>
            ))}
          </select>
        )
        break
      case Type.Text:
        control = (
          <textarea
            id={id}
            value={value}
            disabled={disabled}
            rows={4}
            onChange={(e) => onChange(e.target.value)}
            className={textareaClass}
          />
        )
        break
      case Type.Number:
      case Type.Float:
        control = (
          <Input
            id={id}
            type="number"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        )
        break
      default:
        control = (
          <Input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        )
    }

    return (
      <FormField
        key={item.key}
        label={tSetting(item.key)}
        htmlFor={id}
        help={tSettingTip(item.key) || undefined}
      >
        {control}
        {item.flag === Flag.DEPRECATED && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 gap-1.5 text-destructive-text"
            onClick={() => setDeleteTarget(item)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除此项
          </Button>
        )}
      </FormField>
    )
  }

  const errorText =
    data && data.code !== 200
      ? data.message
      : query.isError
        ? errorMessage(query.error)
        : ""

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Object.entries(GROUP_LABELS).map(([key, label]) => {
          const value = Number(key)
          const active = value === group
          return (
            <button
              key={key}
              type="button"
              onClick={() => setGroup(value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors duration-150 ease-ui",
                active
                  ? "border-primary bg-primary/[0.12] text-primary"
                  : "border-border bg-surface text-subtle hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <AdminSection
        title="设置"
        description={GROUP_LABELS[group]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
            刷新
          </Button>
        }
        bodyClassName="p-0"
      >
        {query.isLoading ? (
          <AdminLoading rows={5} />
        ) : errorText ? (
          <AdminError message={errorText} onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <AdminEmpty message="该分组下暂无设置项" />
        ) : (
          <>
            <AdminGrid>{items.map(renderField)}</AdminGrid>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => defaultMutation.mutate(group)}
                disabled={defaultMutation.isPending}
              >
                <RotateCcw className={cn("h-4 w-4", defaultMutation.isPending && "animate-spin")} />
                加载默认值
              </Button>
              <span className="ml-auto flex items-center gap-2">
                {modified.length > 0 && (
                  <span className="text-[11px] text-subtle">{modified.length} 项已修改</span>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={modified.length === 0 || saveMutation.isPending}
                >
                  保存
                </Button>
              </span>
            </div>
          </>
        )}
      </AdminSection>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除设置项"
        description={`确定要删除「${deleteTarget?.key ?? ""}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        destructive
        pending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.key)}
      />
    </div>
  )
}

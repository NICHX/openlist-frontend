import * as React from "react"
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Power, Puzzle, RefreshCw, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import type { PluginConfigField, PluginItem } from "@/api/endpoints"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminSection,
  AdminTable,
  AdminTableRow,
  ConfirmDialog,
  FormField,
  SectionNote,
  StatusBadge,
} from "../ui"

const LIST_KEY = ["admin", "plugins"] as const

const SELECT_CLASS =
  "flex h-9 w-full rounded-input border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors duration-150 ease-ui focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11"

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

/** 服务端未提供插件接口时的判定（404 或语义化文案）。 */
const isUnsupported = (code: number, message: string): boolean =>
  code === 404 || /not found|unsupported|not support|不存在|未启用/i.test(message)

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[72px] w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-foreground",
        "placeholder:text-subtle/70 transition-colors duration-150 ease-ui",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}

const asText = (value: unknown): string => (value == null ? "" : String(value))

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  onChange: (value: unknown) => void
}) {
  switch (field.type) {
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "number" ? value : asText(value)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      )
    case "bool":
      return (
        <div className="flex h-9 items-center gap-2 max-md:h-11">
          <Switch checked={!!value} onCheckedChange={(next) => onChange(next)} />
          <span className="text-[12px] text-subtle">{value ? "开启" : "关闭"}</span>
        </div>
      )
    case "select":
      return (
        <select className={SELECT_CLASS} value={asText(value)} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case "text":
      return <Textarea rows={4} value={asText(value)} onChange={(e) => onChange(e.target.value)} />
    default:
      return <Input value={asText(value)} onChange={(e) => onChange(e.target.value)} />
  }
}

export function PluginsSection() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [configId, setConfigId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PluginItem | null>(null)

  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => adminApi.pluginList(),
    retry: false,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: LIST_KEY })

  const toggle = useMutation({
    mutationFn: (args: { id: string; enabled: boolean }) =>
      adminApi.pluginToggle(args.id, args.enabled).then(unwrap),
    onSuccess: (data) => {
      toast.success(data.enabled ? "已启用插件" : "已禁用插件")
      void invalidate()
    },
    onError: (error) => toast.error(errorMessage(error, "操作失败")),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.pluginDelete(id).then(unwrap),
    onSuccess: () => {
      toast.success("已删除插件")
      setPendingDelete(null)
      void invalidate()
    },
    onError: (error) => toast.error(errorMessage(error, "删除失败")),
  })

  const items = list.data?.code === 200 ? (list.data.data.content ?? []) : []
  const listError = list.data && list.data.code !== 200 ? list.data : null

  return (
    <div className="space-y-4">
      <AdminSection
        title="插件管理"
        description="安装、配置与启停 OpenList 插件"
        bodyClassName="p-0"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              aria-label="刷新插件列表"
              onClick={() => void list.refetch()}
            >
              <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
              刷新
            </Button>
            <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              添加插件
            </Button>
          </>
        }
      >
        {list.isLoading ? (
          <AdminLoading rows={4} />
        ) : listError ? (
          <div>
            <AdminError message={listError.message} onRetry={() => void list.refetch()} />
            {isUnsupported(listError.code, listError.message) && (
              <div className="px-4 pb-4">
                <SectionNote>当前服务端版本可能未启用插件功能（插件接口不可用）。</SectionNote>
              </div>
            )}
          </div>
        ) : items.length === 0 ? (
          <AdminEmpty
            message="尚未安装任何插件"
            action={
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                添加插件
              </Button>
            }
          />
        ) : (
          <AdminTable head={["插件", "类型", "版本", "作者", "状态", ""]}>
            {items.map((plugin) => (
              <AdminTableRow
                key={plugin.id}
                cells={[
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-input bg-muted text-subtle">
                      {plugin.icon ? (
                        <img src={plugin.icon} alt="" className="h-5 w-5 object-contain" />
                      ) : (
                        <Puzzle className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">
                          {plugin.name || plugin.id}
                        </span>
                        {plugin.high_privilege && (
                          <span className="shrink-0 rounded-full bg-destructive/[0.12] px-1.5 py-0.5 text-[10px] font-semibold text-destructive-text">
                            Root
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-subtle">
                        {plugin.description || plugin.id}
                      </span>
                    </span>
                  </span>,
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-subtle">
                    {plugin.type || "ui"}
                  </span>,
                  <span className="text-[13px] text-subtle">v{plugin.version || "1.0.0"}</span>,
                  <span className="truncate text-[13px] text-subtle">{plugin.author || "未知"}</span>,
                  <StatusBadge ok={plugin.enabled} />,
                ]}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`配置 ${plugin.name || plugin.id}`}
                      title="配置"
                      onClick={() => setConfigId(plugin.id)}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={plugin.enabled ? `禁用 ${plugin.name || plugin.id}` : `启用 ${plugin.name || plugin.id}`}
                      title={plugin.enabled ? "禁用" : "启用"}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: plugin.id, enabled: !plugin.enabled })}
                    >
                      <Power
                        className={cn("h-3.5 w-3.5", plugin.enabled ? "text-primary" : "text-subtle")}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除 ${plugin.name || plugin.id}`}
                      title="删除"
                      onClick={() => setPendingDelete(plugin)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive-text" />
                    </Button>
                  </>
                }
              />
            ))}
          </AdminTable>
        )}
      </AdminSection>

      {addOpen && <AddPluginDialog onClose={() => setAddOpen(false)} />}
      {configId && <PluginConfigDialog pluginId={configId} onClose={() => setConfigId(null)} />}

      <ConfirmDialog
        open={pendingDelete != null}
        title="删除插件"
        description={
          pendingDelete
            ? `确定删除插件「${pendingDelete.name || pendingDelete.id}」吗？此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        destructive
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  )
}

function AddPluginDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [manifestUrl, setManifestUrl] = useState("")
  const [highPrivilege, setHighPrivilege] = useState(false)

  const install = useMutation({
    mutationFn: () =>
      adminApi
        .pluginInstall({ manifest_url: manifestUrl.trim(), high_privilege: highPrivilege })
        .then(unwrap),
    onSuccess: () => {
      toast.success("插件安装成功")
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, "安装失败")),
  })

  const submit = () => {
    if (!manifestUrl.trim()) {
      toast.error("请输入插件清单地址")
      return
    }
    install.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加插件</DialogTitle>
          <DialogDescription>通过插件清单（manifest）地址安装。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormField
            label="插件清单地址"
            htmlFor="plugin-manifest-url"
            required
            help="指向插件 manifest JSON（通常由插件市场或作者提供）。"
          >
            <Input
              id="plugin-manifest-url"
              value={manifestUrl}
              placeholder="https://example.com/plugin.json"
              onChange={(e) => setManifestUrl(e.target.value)}
            />
          </FormField>

          <FormField
            label="高权限（Root）"
            htmlFor="plugin-add-privilege"
            help="授予插件更宽的系统权限，请仅对可信插件开启。"
          >
            <div className="flex h-9 items-center gap-2 max-md:h-11">
              <Switch id="plugin-add-privilege" checked={highPrivilege} onCheckedChange={setHighPrivilege} />
              <span className="text-[13px] text-subtle">{highPrivilege ? "已授权" : "普通权限"}</span>
            </div>
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={install.isPending}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={install.isPending}>
            {install.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PluginConfigDialog({ pluginId, onClose }: { pluginId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ["admin", "plugins", pluginId],
    queryFn: () => adminApi.pluginGet(pluginId),
    retry: false,
  })
  const plugin = detail.data?.code === 200 ? detail.data.data : null
  const detailError = detail.data && detail.data.code !== 200 ? detail.data : null

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [enabled, setEnabled] = useState(true)
  const [highPrivilege, setHighPrivilege] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!plugin || initialized) return
    const next: Record<string, unknown> = {}
    for (const field of plugin.config_schema ?? []) {
      const current = plugin.config_values?.[field.key]
      if (current !== undefined) next[field.key] = current
      else if (field.defaultValue !== undefined) next[field.key] = field.defaultValue
    }
    setValues(next)
    setEnabled(!!plugin.enabled)
    setHighPrivilege(!!plugin.high_privilege)
    setInitialized(true)
  }, [plugin, initialized])

  const save = useMutation({
    mutationFn: () =>
      adminApi
        .pluginUpdate({
          id: pluginId,
          config_values: values,
          high_privilege: highPrivilege,
          enabled,
        })
        .then(unwrap),
    onSuccess: () => {
      toast.success("已保存插件配置")
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, "保存失败")),
  })

  const setField = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>配置插件</DialogTitle>
          <DialogDescription>{plugin ? plugin.name : pluginId}</DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <AdminLoading rows={3} />
        ) : detailError ? (
          <AdminError message={detailError.message} onRetry={() => void detail.refetch()} />
        ) : plugin ? (
          <div className="space-y-3">
            <FormField label="启用状态" htmlFor="plugin-config-enabled">
              <div className="flex h-9 items-center gap-2 max-md:h-11">
                <Switch id="plugin-config-enabled" checked={enabled} onCheckedChange={setEnabled} />
                <span className="text-[13px] text-subtle">{enabled ? "已启用" : "已禁用"}</span>
              </div>
            </FormField>

            <FormField
              label="高权限（Root）"
              htmlFor="plugin-config-privilege"
              help="授予插件更宽的系统权限，请仅对可信插件开启。"
            >
              <div className="flex h-9 items-center gap-2 max-md:h-11">
                <Switch
                  id="plugin-config-privilege"
                  checked={highPrivilege}
                  onCheckedChange={setHighPrivilege}
                />
                <span className="text-[13px] text-subtle">{highPrivilege ? "已授权" : "普通权限"}</span>
              </div>
            </FormField>

            {(plugin.config_schema ?? []).length === 0 ? (
              <p className="rounded-card border border-border bg-muted/40 px-4 py-3 text-[12px] text-subtle">
                该插件没有可配置项。
              </p>
            ) : (
              (plugin.config_schema ?? []).map((field) => (
                <FormField
                  key={field.key}
                  label={field.label || field.key}
                  htmlFor={`plugin-field-${field.key}`}
                  help={field.description}
                  required={field.required}
                >
                  <ConfigFieldInput
                    field={field}
                    value={values[field.key]}
                    onChange={(value) => setField(field.key, value)}
                  />
                </FormField>
              ))
            )}
          </div>
        ) : (
          <AdminError message="未找到该插件" />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            取消
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !plugin}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

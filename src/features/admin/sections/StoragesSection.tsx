import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { Type } from "@/api/types"
import type { AdminStorage, DriverItem } from "@/api/types"
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
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  tDriverAlert,
  tDriverName,
  tDriverOption,
  tFieldLabel,
  tFieldTip,
  tStorageOption,
} from "../i18n"
import {
  AdminEmpty,
  AdminError,
  AdminGrid,
  AdminLoading,
  AdminRow,
  AdminSection,
  ConfirmDialog,
  FormField,
  SectionNote,
  StatusBadge,
  StatusDot,
} from "../ui"

const selectClass =
  "flex h-9 w-full rounded-input border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors duration-150 ease-ui focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11"

function toText(value: unknown): string {
  if (value === undefined || value === null) return ""
  return String(value)
}

function parseDefault(item: DriverItem): unknown {
  switch (item.type) {
    case Type.Bool:
      return item.default === "true"
    case Type.Number: {
      const n = parseInt(item.default, 10)
      return Number.isNaN(n) ? 0 : n
    }
    case Type.Float: {
      const n = parseFloat(item.default)
      return Number.isNaN(n) ? 0 : n
    }
    default:
      return item.default
  }
}

function parseAddition(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }
  return {}
}

function DriverField({
  item,
  driver,
  scope,
  value,
  onChange,
}: {
  item: DriverItem
  driver: string
  scope: "common" | "additional"
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = `driver-field-${item.name}`
  const label =
    scope === "common" ? tFieldLabel({ name: item.name, scope: "common" }) : tFieldLabel({ name: item.name, driver })
  const tip =
    scope === "common" ? tFieldTip({ name: item.name, scope: "common" }) : tFieldTip({ name: item.name, driver })
  const field = { label, help: tip || undefined, required: item.required, htmlFor: id }

  switch (item.type) {
    case Type.Bool:
      return (
        <FormField {...field}>
          <Switch id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
        </FormField>
      )
    case Type.Text:
      return (
        <FormField {...field} className="sm:col-span-2">
          <textarea
            id={id}
            className={cn(selectClass, "h-auto min-h-[80px] resize-y py-2")}
            value={toText(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      )
    case Type.Select:
      return (
        <FormField {...field}>
          <select id={id} className={selectClass} value={toText(value)} onChange={(e) => onChange(e.target.value)}>
            <option value="">请选择</option>
            {item.options
              .split(",")
              .filter((opt) => opt !== "")
              .map((opt) => (
                <option key={opt} value={opt}>
                  {scope === "common" ? tStorageOption(item.name, opt) : tDriverOption(driver, item.name, opt)}
                </option>
              ))}
          </select>
        </FormField>
      )
    case Type.Number:
    case Type.Float:
      return (
        <FormField {...field}>
          <Input id={id} type="number" value={toText(value)} onChange={(e) => onChange(e.target.value)} />
        </FormField>
      )
    default:
      return (
        <FormField {...field}>
          <Input id={id} value={toText(value)} onChange={(e) => onChange(e.target.value)} />
        </FormField>
      )
  }
}

export function StoragesSection() {
  const queryClient = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [driver, setDriver] = useState("")
  const [storage, setStorage] = useState<Record<string, unknown>>({})
  const [addition, setAddition] = useState<Record<string, unknown>>({})
  const [pendingInit, setPendingInit] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: "delete" | "disable"; target: AdminStorage } | null>(null)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin", "storage"] })

  const storages = useQuery({
    queryKey: ["admin", "storage"],
    queryFn: () => adminApi.storageList(),
    retry: false,
  })

  const driverList = useQuery({
    queryKey: ["admin", "storage", "drivers"],
    queryFn: () => adminApi.driverList(),
    enabled: editorOpen && editingId === null,
    retry: false,
  })

  const driverInfo = useQuery({
    queryKey: ["admin", "storage", "driver", driver],
    queryFn: () => adminApi.driverInfo(driver),
    enabled: editorOpen && driver !== "",
    retry: false,
  })

  const info = driverInfo.data?.code === 200 ? driverInfo.data.data : null
  const driverAlert = driver ? tDriverAlert(driver) : ""
  const driverNames = driverList.data?.code === 200 ? Object.keys(driverList.data.data) : []
  const items = storages.data?.code === 200 ? (storages.data.data.content ?? []) : []
  const listError =
    storages.data && storages.data.code !== 200
      ? storages.data.message
      : storages.error instanceof Error
        ? storages.error.message
        : ""

  useEffect(() => {
    if (!pendingInit || !info) return
    setStorage((prev) => {
      const next: Record<string, unknown> = { ...prev }
      for (const item of info.common) next[item.name] = parseDefault(item)
      return next
    })
    const nextAddition: Record<string, unknown> = {}
    for (const item of info.additional) nextAddition[item.name] = parseDefault(item)
    setAddition(nextAddition)
    setPendingInit(false)
  }, [pendingInit, info])

  const loadEdit = useMutation({
    mutationFn: (id: number) => adminApi.storageGet(id).then(unwrap),
    onSuccess: (data) => {
      setEditingId(data.id)
      setDriver(data.driver)
      setAddition(parseAddition(data.addition))
      setStorage({ ...data, addition: "" })
      setPendingInit(false)
      setEditorOpen(true)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "加载存储失败"),
  })

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingId === null ? adminApi.storageCreate(payload).then(unwrap) : adminApi.storageUpdate(payload).then(unwrap),
    onSuccess: () => {
      toast.success(editingId === null ? "存储已创建" : "存储已更新")
      setEditorOpen(false)
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
  })

  const toggle = useMutation({
    mutationFn: (vars: { id: number; enable: boolean }) =>
      vars.enable ? adminApi.storageEnable(vars.id).then(unwrap) : adminApi.storageDisable(vars.id).then(unwrap),
    onSuccess: (_data, vars) => {
      toast.success(vars.enable ? "已启用" : "已禁用")
      setConfirm(null)
      invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "操作失败")
      setConfirm(null)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => adminApi.storageDelete(id).then(unwrap),
    onSuccess: () => {
      toast.success("已删除")
      setConfirm(null)
      invalidate()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除失败")
      setConfirm(null)
    },
  })

  const loadAll = useMutation({
    mutationFn: () => adminApi.storageLoadAll().then(unwrap),
    onSuccess: () => {
      toast.success("已重新加载全部存储")
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "重新加载失败"),
  })

  function openCreate() {
    setEditingId(null)
    setDriver("")
    setStorage({})
    setAddition({})
    setPendingInit(false)
    setEditorOpen(true)
  }

  function handleDriverChange(next: string) {
    setDriver(next)
    setAddition({})
    setPendingInit(true)
  }

  function handleSave() {
    if (!driver) {
      toast.error("请先选择驱动")
      return
    }
    const mountPath = typeof storage.mount_path === "string" ? storage.mount_path.trim() : ""
    if (!mountPath) {
      toast.error("挂载路径不能为空")
      return
    }
    const payload: Record<string, unknown> = {
      ...storage,
      mount_path: mountPath,
      addition: JSON.stringify(addition),
    }
    if (editingId === null) {
      delete payload.id
      delete payload.status
      delete payload.disabled
      delete payload.modified
    } else {
      payload.id = editingId
    }
    save.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="存储管理"
        description="配置与挂载各类存储驱动"
        actions={
          <>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void storages.refetch()}>
              <RefreshCw className={cn("h-4 w-4", storages.isFetching && "animate-spin")} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loadAll.isPending}
              onClick={() => loadAll.mutate()}
            >
              {loadAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新加载全部
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              添加存储
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        {storages.isLoading ? (
          <AdminLoading rows={4} />
        ) : listError ? (
          <AdminError message={listError} onRetry={() => void storages.refetch()} />
        ) : items.length === 0 ? (
          <AdminEmpty
            message="还没有配置任何存储"
            action={
              <Button size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                添加存储
              </Button>
            }
          />
        ) : (
          <div>
            {items.map((item) => (
              <AdminRow key={item.id}>
                <StatusDot ok={!item.disabled} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{item.mount_path}</span>
                  <span className="block truncate text-[11px] text-subtle">
                    {tDriverName(item.driver)}
                    {item.remark ? ` · ${item.remark}` : ""}
                    {item.mount_details
                      ? ` · ${formatBytes(item.mount_details.used_space)} / ${formatBytes(item.mount_details.total_space)}`
                      : ""}
                  </span>
                </span>
                <StatusBadge ok={!item.disabled} />
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="编辑" onClick={() => loadEdit.mutate(item.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={item.disabled ? "启用" : "禁用"}
                    onClick={() => {
                      if (item.disabled) toggle.mutate({ id: item.id, enable: true })
                      else setConfirm({ kind: "disable", target: item })
                    }}
                  >
                    {item.disabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    className="text-destructive-text"
                    onClick={() => setConfirm({ kind: "delete", target: item })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}
      </AdminSection>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "delete" ? "删除存储" : "禁用存储"}
        description={
          confirm
            ? confirm.kind === "delete"
              ? `确定要删除「${confirm.target.mount_path}」吗？此操作不可撤销。`
              : `确定要禁用「${confirm.target.mount_path}」吗？禁用后该存储将无法访问。`
            : ""
        }
        confirmLabel={confirm?.kind === "delete" ? "删除" : "禁用"}
        destructive={confirm?.kind === "delete"}
        pending={remove.isPending || toggle.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === "delete") remove.mutate(confirm.target.id)
          else toggle.mutate({ id: confirm.target.id, enable: false })
        }}
      />

      <Dialog open={editorOpen} onOpenChange={(next) => !next && setEditorOpen(false)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingId === null ? "添加存储" : "编辑存储"}</DialogTitle>
            <DialogDescription>
              {editingId === null ? "选择驱动并填写挂载与驱动配置。" : `正在编辑 #${editingId}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="驱动" required>
              {editingId === null ? (
                <select className={selectClass} value={driver} onChange={(e) => handleDriverChange(e.target.value)}>
                  <option value="">请选择驱动</option>
                  {driverNames.map((name) => (
                    <option key={name} value={name}>
                      {tDriverName(name)}
                    </option>
                  ))}
                </select>
              ) : (
                <Input value={tDriverName(driver)} disabled />
              )}
            </FormField>

            {driverAlert && <SectionNote>{driverAlert.split("|")[0]}</SectionNote>}

            {driverInfo.isLoading ? (
              <AdminLoading rows={3} />
            ) : info ? (
              <>
                {info.common.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-bold">通用设置</p>
                    <AdminGrid>
                      {info.common.map((item) => (
                        <DriverField
                          key={item.name}
                          item={item}
                          driver={driver}
                          scope="common"
                          value={storage[item.name]}
                          onChange={(value) => setStorage((prev) => ({ ...prev, [item.name]: value }))}
                        />
                      ))}
                    </AdminGrid>
                  </div>
                )}
                {info.additional.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[13px] font-bold">驱动设置</p>
                    <AdminGrid>
                      {info.additional.map((item) => (
                        <DriverField
                          key={item.name}
                          item={item}
                          driver={driver}
                          scope="additional"
                          value={addition[item.name]}
                          onChange={(value) => setAddition((prev) => ({ ...prev, [item.name]: value }))}
                        />
                      ))}
                    </AdminGrid>
                  </div>
                )}
              </>
            ) : driver ? (
              driverInfo.isError ? (
                <AdminError message="驱动信息加载失败" />
              ) : null
            ) : (
              <p className="text-[13px] text-subtle">选择一个驱动以加载配置项。</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link2, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { shareApi, unwrap } from "@/api"
import type { AdminShare } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { copyText } from "@/lib/download"
import { cn } from "@/lib/utils"
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
} from "../ui"

const SHARES_KEY = ["admin", "shares"] as const

interface ShareForm {
  id: string
  files: string
  pwd: string
  expires: string
  max_accessed: string
  remark: string
  order_by: string
  order_direction: string
  extract_folder: string
}

const EMPTY_FORM: ShareForm = {
  id: "",
  files: "",
  pwd: "",
  expires: "",
  max_accessed: "0",
  remark: "",
  order_by: "",
  order_direction: "",
  extract_folder: "",
}

/** 按换行/逗号切分文件路径并去掉空项。 */
const splitFiles = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean)

const pad = (n: number) => String(n).padStart(2, "0")

/** ISO 字符串 -> datetime-local 需要的本地时间格式。 */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

/** datetime-local 值 -> ISO 字符串（空值表示永久有效）。 */
const fromLocalInput = (value: string): string | null => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const formatExpires = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

const formFromShare = (share: AdminShare | null): ShareForm =>
  share
    ? {
        id: share.id,
        files: share.files.join("\n"),
        pwd: share.pwd ?? "",
        expires: toLocalInput(share.expires),
        max_accessed: String(share.max_accessed ?? 0),
        remark: share.remark ?? "",
        order_by: share.order_by ?? "",
        order_direction: share.order_direction ?? "",
        extract_folder: share.extract_folder ?? "",
      }
    : { ...EMPTY_FORM }

const selectClass =
  "h-9 w-full rounded-input border border-border bg-surface px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 max-md:h-11"

const textareaClass =
  "min-h-[96px] w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"

export function SharesSection() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AdminShare | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AdminShare | null>(null)

  const list = useQuery({
    queryKey: SHARES_KEY,
    queryFn: async () => unwrap(await shareApi.list()),
    retry: false,
  })

  const invalidate = () => void qc.invalidateQueries({ queryKey: SHARES_KEY })

  const toggle = useMutation({
    mutationFn: async (share: AdminShare) =>
      share.disabled ? unwrap(await shareApi.enable(share.id)) : unwrap(await shareApi.disable(share.id)),
    onSuccess: (_data, share) => {
      toast.success(share.disabled ? "已启用分享" : "已禁用分享")
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "操作失败"),
  })

  const remove = useMutation({
    mutationFn: async (share: AdminShare) => unwrap(await shareApi.remove(share.id)),
    onSuccess: () => {
      toast.success("分享已删除")
      setDeleting(null)
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败"),
  })

  const copyLink = async (share: AdminShare) => {
    const url = `${window.location.origin}/sd/${share.id}`
    const ok = await copyText(url)
    if (ok) toast.success("已复制分享直链")
    else toast.error("复制失败")
  }

  const items = list.data?.content ?? []
  const errorMessage =
    list.error instanceof Error ? list.error.message : list.error ? "加载分享失败" : ""

  return (
    <div className="space-y-4">
      <AdminSection
        title="分享链接"
        description="管理分享记录，复制可下载的服务端直链"
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
              刷新
            </Button>
            <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              新建分享
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        {list.isPending ? (
          <AdminLoading />
        ) : errorMessage ? (
          <AdminError message={errorMessage} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <AdminEmpty
            message="还没有创建任何分享"
            action={
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                新建分享
              </Button>
            }
          />
        ) : (
          <div>
            {items.map((share) => (
              <AdminRow key={share.id}>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{share.id}</span>
                  <span className="block truncate text-[11px] text-subtle">{share.remark || "无备注"}</span>
                </div>
                <span className="tnum shrink-0 text-[12px] text-subtle">{share.files.length} 个文件</span>
                <span className="shrink-0 text-[12px] text-subtle">
                  {share.expires ? formatExpires(share.expires) : "永久有效"}
                </span>
                <span className="tnum shrink-0 text-[12px] text-subtle">
                  {share.accessed ?? 0} / {share.max_accessed > 0 ? share.max_accessed : "∞"}
                </span>
                <StatusBadge ok={!share.pwd} okText="无密码" badText="有密码" />
                <StatusBadge ok={!share.disabled} />
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="编辑"
                    onClick={() => setEditing(share)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="复制直链"
                    onClick={() => void copyLink(share)}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={share.disabled ? "启用" : "禁用"}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(share)}
                  >
                    {share.disabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    onClick={() => setDeleting(share)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive-text" />
                  </Button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}
      </AdminSection>

      <SectionNote>
        本项目替换了官方前端，未提供分享网页浏览页 <code className="mx-1 rounded bg-muted px-1">/s/&lt;id&gt;</code>
        ，因此直接访问 /s/&lt;id&gt; 的网页浏览不在本前端范围内。但 OpenList 服务端的分享直链下载接口
        <code className="mx-1 rounded bg-muted px-1">/sd/&lt;id&gt;</code>
        可用，「复制直链」会复制{" "}
        <code className="mx-1 rounded bg-muted px-1">{`${window.location.origin}/sd/<id>`}</code>
        （可直接下载）。分享记录的创建、编辑、启停与删除均可在此管理。
      </SectionNote>

      {(creating || editing) && (
        <ShareDialog
          share={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="删除分享"
        description={deleting ? `确定删除分享「${deleting.id}」吗？该操作不可撤销。` : ""}
        confirmLabel="删除"
        destructive
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  )
}

function ShareDialog({ share, onClose }: { share: AdminShare | null; onClose: () => void }) {
  const qc = useQueryClient()
  const editing = share !== null
  const [form, setForm] = useState<ShareForm>(() => formFromShare(share))
  const set = (key: keyof ShareForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        id: form.id.trim(),
        files: splitFiles(form.files),
        pwd: form.pwd,
        expires: fromLocalInput(form.expires),
        max_accessed: Number(form.max_accessed) || 0,
        remark: form.remark,
        order_by: form.order_by,
        order_direction: form.order_direction,
        extract_folder: form.extract_folder,
      }
      return editing ? unwrap(await shareApi.update(payload)) : unwrap(await shareApi.create(payload))
    },
    onSuccess: () => {
      toast.success(editing ? "分享已更新" : "分享已创建")
      void qc.invalidateQueries({ queryKey: SHARES_KEY })
      onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
  })

  const submit = () => {
    if (splitFiles(form.files).length === 0) {
      toast.error("请至少填写一个文件路径")
      return
    }
    save.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑分享" : "新建分享"}</DialogTitle>
          <DialogDescription>文件路径支持换行或逗号分隔，至少填写一项</DialogDescription>
        </DialogHeader>

        <AdminGrid>
          <FormField label="分享 ID" help="留空表示由服务端自动生成；创建后不可修改" htmlFor="share-id">
            <Input
              id="share-id"
              value={form.id}
              readOnly={editing}
              placeholder="留空自动生成"
              onChange={(e) => set("id", e.target.value)}
            />
          </FormField>
          <FormField label="备注" htmlFor="share-remark">
            <Input
              id="share-remark"
              value={form.remark}
              placeholder="可选，便于识别"
              onChange={(e) => set("remark", e.target.value)}
            />
          </FormField>

          <FormField
            label="文件路径"
            required
            help="每行一个路径，也可用逗号分隔"
            className="sm:col-span-2"
            htmlFor="share-files"
          >
            <textarea
              id="share-files"
              className={textareaClass}
              value={form.files}
              placeholder={"/目录/文件.txt\n/另一个目录"}
              onChange={(e) => set("files", e.target.value)}
            />
          </FormField>

          <FormField label="密码" help="可选，留空表示无密码" htmlFor="share-pwd">
            <Input
              id="share-pwd"
              value={form.pwd}
              placeholder="可选"
              onChange={(e) => set("pwd", e.target.value)}
            />
          </FormField>
          <FormField label="过期时间" help="留空表示永久有效" htmlFor="share-expires">
            <Input
              id="share-expires"
              type="datetime-local"
              value={form.expires}
              onChange={(e) => set("expires", e.target.value)}
            />
          </FormField>

          <FormField label="最大访问次数" help="0 表示不限次数" htmlFor="share-max">
            <Input
              id="share-max"
              type="number"
              min={0}
              value={form.max_accessed}
              onChange={(e) => set("max_accessed", e.target.value)}
            />
          </FormField>
          <FormField label="提取文件夹" htmlFor="share-extract">
            <select
              id="share-extract"
              className={selectClass}
              value={form.extract_folder}
              onChange={(e) => set("extract_folder", e.target.value)}
            >
              <option value="">默认</option>
              <option value="front">前置文件夹</option>
              <option value="back">后置文件夹</option>
            </select>
          </FormField>

          <FormField label="排序字段" htmlFor="share-order-by">
            <select
              id="share-order-by"
              className={selectClass}
              value={form.order_by}
              onChange={(e) => set("order_by", e.target.value)}
            >
              <option value="">默认</option>
              <option value="name">名称</option>
              <option value="size">大小</option>
              <option value="modified">修改时间</option>
            </select>
          </FormField>
          <FormField label="排序方向" htmlFor="share-order-dir">
            <select
              id="share-order-dir"
              className={selectClass}
              value={form.order_direction}
              onChange={(e) => set("order_direction", e.target.value)}
            >
              <option value="">默认</option>
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </FormField>
        </AdminGrid>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {save.isPending ? "保存中…" : editing ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

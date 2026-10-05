import * as React from "react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import type { AdminMeta } from "@/api/types"
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
  AdminRow,
  AdminSection,
  ConfirmDialog,
  FormField,
  StatusBadge,
} from "../ui"

interface MetaFormState {
  path: string
  password: string
  write: boolean
  hide: string
  readme: string
  header: string
  p_sub: boolean
  w_sub: boolean
  h_sub: boolean
  r_sub: boolean
  header_sub: boolean
  read_users_sub: boolean
  write_users_sub: boolean
  read_users: string
  write_users: string
}

const EMPTY_FORM: MetaFormState = {
  path: "",
  password: "",
  write: false,
  hide: "",
  readme: "",
  header: "",
  p_sub: false,
  w_sub: false,
  h_sub: false,
  r_sub: false,
  header_sub: false,
  read_users_sub: false,
  write_users_sub: false,
  read_users: "",
  write_users: "",
}

const fromMeta = (meta: AdminMeta): MetaFormState => ({
  path: meta.path,
  password: meta.password,
  write: meta.write,
  hide: meta.hide,
  readme: meta.readme,
  header: meta.header,
  p_sub: meta.p_sub,
  w_sub: meta.w_sub,
  h_sub: meta.h_sub,
  r_sub: meta.r_sub,
  header_sub: meta.header_sub,
  read_users_sub: meta.read_users_sub,
  write_users_sub: meta.write_users_sub,
  read_users: meta.read_users.join(", "),
  write_users: meta.write_users.join(", "),
})

const parseIds = (value: string): number[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => Number(part))
    .filter((part) => Number.isInteger(part))

const toPayload = (form: MetaFormState): Record<string, unknown> => ({
  path: form.path,
  password: form.password,
  write: form.write,
  hide: form.hide,
  readme: form.readme,
  header: form.header,
  p_sub: form.p_sub,
  w_sub: form.w_sub,
  h_sub: form.h_sub,
  r_sub: form.r_sub,
  header_sub: form.header_sub,
  read_users_sub: form.read_users_sub,
  write_users_sub: form.write_users_sub,
  read_users: parseIds(form.read_users),
  write_users: parseIds(form.write_users),
})

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

function SwitchField({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string
  label: string
  help?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <FormField label={label} htmlFor={id} help={help}>
      <div className="flex h-9 items-center gap-2 max-md:h-11">
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
        <span className="text-[12px] text-subtle">{checked ? "开启" : "关闭"}</span>
      </div>
    </FormField>
  )
}

export function MetasSection() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminMeta | null>(null)
  const [form, setForm] = useState<MetaFormState>(EMPTY_FORM)
  const [pendingDelete, setPendingDelete] = useState<AdminMeta | null>(null)

  const list = useQuery({
    queryKey: ["admin", "metas"],
    queryFn: () => adminApi.metaList(),
    retry: false,
  })
  const metas = list.data?.code === 200 ? list.data.data.content : []
  const firstError = list.data && list.data.code !== 200 ? list.data.message : ""

  const set = <K extends keyof MetaFormState>(key: K, value: MetaFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: async (args: { form: MetaFormState; id: number | null }) => {
      const payload = toPayload(args.form)
      return args.id == null
        ? unwrap(await adminApi.metaCreate(payload))
        : unwrap(await adminApi.metaUpdate({ ...payload, id: args.id }))
    },
    onSuccess: (_data, args) => {
      toast.success(args.id == null ? "已添加元信息" : "已保存元信息")
      setDialogOpen(false)
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: ["admin", "metas"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
  })

  const remove = useMutation({
    mutationFn: async (id: number) => unwrap(await adminApi.metaDelete(id)),
    onSuccess: () => {
      toast.success("已删除元信息")
      setPendingDelete(null)
      void queryClient.invalidateQueries({ queryKey: ["admin", "metas"] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败"),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (meta: AdminMeta) => {
    setEditing(meta)
    setForm(fromMeta(meta))
    setDialogOpen(true)
  }

  const submit = () => {
    const path = form.path.trim()
    if (!path) {
      toast.error("请填写路径")
      return
    }
    save.mutate({ form: { ...form, path }, id: editing?.id ?? null })
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="元信息"
        description="为路径配置密码、写入权限、隐藏规则、说明与头部内容"
        bodyClassName="p-0"
        actions={
          <>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void list.refetch()}>
              <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
              刷新
            </Button>
            <Button variant="primary" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              添加元信息
            </Button>
          </>
        }
      >
        {list.isLoading ? (
          <AdminLoading rows={4} />
        ) : firstError ? (
          <AdminError message={firstError} onRetry={() => void list.refetch()} />
        ) : metas.length === 0 ? (
          <AdminEmpty
            message="还没有配置任何元信息"
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                添加元信息
              </Button>
            }
          />
        ) : (
          <div>
            {metas.map((meta) => (
              <AdminRow key={meta.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{meta.path}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge ok={!!meta.password} okText="已设密码" badText="无密码" />
                    <StatusBadge ok={meta.write} okText="可写" badText="只读" />
                    <StatusBadge ok={!!meta.hide} okText="隐藏规则" badText="无隐藏" />
                    <StatusBadge ok={!!meta.readme} okText="说明" badText="无说明" />
                    <StatusBadge ok={!!meta.header} okText="头部" badText="无头部" />
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="编辑" onClick={() => openEdit(meta)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive-text hover:text-destructive-text"
                    aria-label="删除"
                    onClick={() => setPendingDelete(meta)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </AdminRow>
            ))}
          </div>
        )}
      </AdminSection>

      <Dialog open={dialogOpen} onOpenChange={(next) => !next && setDialogOpen(false)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑元信息" : "添加元信息"}</DialogTitle>
            <DialogDescription>为指定路径配置访问控制与展示内容，留空的项表示不启用。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="路径" htmlFor="meta-path" required className="sm:col-span-2">
              <Input
                id="meta-path"
                value={form.path}
                placeholder="/"
                onChange={(e) => set("path", e.target.value)}
              />
            </FormField>

            <FormField label="访问密码" htmlFor="meta-password">
              <Input id="meta-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
            </FormField>

            <SwitchField
              id="meta-write"
              label="允许写入"
              checked={form.write}
              onChange={(value) => set("write", value)}
            />

            <FormField
              label="隐藏规则"
              htmlFor="meta-hide"
              help="每行一个正则或文件名，匹配到的条目将被隐藏"
              className="sm:col-span-2"
            >
              <Textarea id="meta-hide" rows={3} value={form.hide} onChange={(e) => set("hide", e.target.value)} />
            </FormField>

            <FormField label="说明（readme）" htmlFor="meta-readme" className="sm:col-span-2">
              <Textarea id="meta-readme" rows={3} value={form.readme} onChange={(e) => set("readme", e.target.value)} />
            </FormField>

            <FormField label="头部内容（header）" htmlFor="meta-header" className="sm:col-span-2">
              <Textarea
                id="meta-header"
                rows={3}
                value={form.header}
                onChange={(e) => set("header", e.target.value)}
              />
            </FormField>

            <FormField label="读取用户 ID" htmlFor="meta-read-users" help="以英文逗号分隔的用户 ID">
              <Input
                id="meta-read-users"
                value={form.read_users}
                onChange={(e) => set("read_users", e.target.value)}
              />
            </FormField>
            <SwitchField
              id="meta-read-users-sub"
              label="读取用户对子目录生效"
              checked={form.read_users_sub}
              onChange={(value) => set("read_users_sub", value)}
            />

            <FormField label="写入用户 ID" htmlFor="meta-write-users" help="以英文逗号分隔的用户 ID">
              <Input
                id="meta-write-users"
                value={form.write_users}
                onChange={(e) => set("write_users", e.target.value)}
              />
            </FormField>
            <SwitchField
              id="meta-write-users-sub"
              label="写入用户对子目录生效"
              checked={form.write_users_sub}
              onChange={(value) => set("write_users_sub", value)}
            />

            <SwitchField
              id="meta-p-sub"
              label="密码对子目录生效"
              checked={form.p_sub}
              onChange={(value) => set("p_sub", value)}
            />
            <SwitchField
              id="meta-w-sub"
              label="写入对子目录生效"
              checked={form.w_sub}
              onChange={(value) => set("w_sub", value)}
            />
            <SwitchField
              id="meta-h-sub"
              label="隐藏对子目录生效"
              checked={form.h_sub}
              onChange={(value) => set("h_sub", value)}
            />
            <SwitchField
              id="meta-r-sub"
              label="说明对子目录生效"
              checked={form.r_sub}
              onChange={(value) => set("r_sub", value)}
            />
            <SwitchField
              id="meta-header-sub"
              label="头部对子目录生效"
              checked={form.header_sub}
              onChange={(value) => set("header_sub", value)}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={save.isPending}>
              取消
            </Button>
            <Button variant="primary" onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete != null}
        title="删除元信息"
        description={pendingDelete ? `确定删除路径「${pendingDelete.path}」的元信息吗？` : ""}
        confirmLabel="删除"
        destructive
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  )
}

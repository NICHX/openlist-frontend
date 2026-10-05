import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eraser, Loader2, Pencil, Plus, RefreshCw, ShieldOff, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { UserRole, roleLabel, type AdminUser } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminSection,
  AdminTable,
  AdminTableRow,
  ConfirmDialog,
  FormField,
  StatusBadge,
} from "../ui"

const USERS_KEY = ["admin", "users"] as const

/** 权限位掩码顺序：下标即位数（第 i 位=1 表示拥有该权限）。 */
const PERMISSIONS = [
  "see_hides",
  "access_without_password",
  "offline_download",
  "write_content",
  "rename",
  "move",
  "copy",
  "delete",
  "webdav_read",
  "webdav_manage",
  "ftp_read",
  "ftp_manage",
  "read_archives",
  "decompress",
  "share",
  "customize_share_id",
] as const

const PERMISSION_LABELS = [
  "查看隐藏文件",
  "免密码访问",
  "离线下载",
  "写入",
  "重命名",
  "移动",
  "复制",
  "删除",
  "WebDAV 读取",
  "WebDAV 管理",
  "FTP 读取",
  "FTP 管理",
  "读取压缩包",
  "解压",
  "分享",
  "自定义分享ID",
] as const

const SELECT_CLASS =
  "flex h-9 w-full rounded-input border border-border bg-surface px-3 py-1.5 text-sm text-foreground transition-colors duration-150 ease-ui focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11"

const hasPermission = (mask: number, index: number): boolean => ((mask >> index) & 1) === 1

const buildPermission = (selected: boolean[]): number =>
  selected.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0)

type ConfirmRequest = { kind: "2fa" | "delete"; user: AdminUser }

export function UsersSection() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => adminApi.userList(),
    retry: false,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_KEY })

  const cancel2fa = useMutation({
    mutationFn: (id: number) => adminApi.userCancel2fa(id).then(unwrap),
    onSuccess: invalidate,
  })
  const delCache = useMutation({
    mutationFn: (id: number) => adminApi.userDelCache(id).then(unwrap),
    onSuccess: invalidate,
  })
  const removeUser = useMutation({
    mutationFn: (id: number) => adminApi.userDelete(id).then(unwrap),
    onSuccess: invalidate,
  })

  const items = users.data?.code === 200 ? (users.data.data.content ?? []) : []
  const firstError =
    users.data && users.data.code !== 200 ? users.data.message : users.isError ? "加载用户列表失败" : ""

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (user: AdminUser) => {
    setEditing(user)
    setDialogOpen(true)
  }

  const handleCancel2fa = async (user: AdminUser) => {
    try {
      await cancel2fa.mutateAsync(user.id)
      toast.success(`已取消「${user.username}」的双重验证`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消 2FA 失败")
    } finally {
      setConfirm(null)
    }
  }

  const handleDelete = async (user: AdminUser) => {
    try {
      await removeUser.mutateAsync(user.id)
      toast.success(`已删除用户「${user.username}」`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    } finally {
      setConfirm(null)
    }
  }

  const handleClearCache = async (user: AdminUser) => {
    try {
      await delCache.mutateAsync(user.id)
      toast.success(`已清除「${user.username}」的缓存`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清除缓存失败")
    }
  }

  return (
    <AdminSection
      title="用户管理"
      description="管理 OpenList 账户、角色与权限"
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label="刷新用户列表"
            onClick={() => void users.refetch()}
          >
            <RefreshCw className={"h-4 w-4" + (users.isFetching ? " animate-spin" : "")} />
            刷新
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加用户
          </Button>
        </>
      }
      bodyClassName="p-0"
    >
      {users.isLoading ? (
        <AdminLoading rows={4} />
      ) : firstError ? (
        <AdminError message={firstError} onRetry={() => void users.refetch()} />
      ) : items.length === 0 ? (
        <AdminEmpty message="还没有任何用户" />
      ) : (
        <AdminTable head={["用户", "角色", "基础路径", "状态", ""]}>
          {items.map((user) => (
            <AdminTableRow
              key={user.id}
              cells={[
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/[0.12] text-[13px] font-bold text-primary">
                    {(user.username.charAt(0) || "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-semibold">{user.username}</span>
                </span>,
                <span className="text-[13px] text-subtle">{roleLabel(user.role)}</span>,
                <span className="block truncate text-[12px] text-subtle">{user.base_path || "/"}</span>,
                <StatusBadge ok={!user.disabled} okText="正常" badText="已停用" />,
              ]}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`编辑 ${user.username}`}
                    title="编辑"
                    onClick={() => openEdit(user)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`取消 ${user.username} 的双重验证`}
                    title="取消 2FA"
                    onClick={() => setConfirm({ kind: "2fa", user })}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`清除 ${user.username} 的缓存`}
                    title="清除缓存"
                    disabled={delCache.isPending}
                    onClick={() => void handleClearCache(user)}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除 ${user.username}`}
                    title="删除"
                    onClick={() => setConfirm({ kind: "delete", user })}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive-text" />
                  </Button>
                </>
              }
            />
          ))}
        </AdminTable>
      )}

      {dialogOpen && <UserFormDialog user={editing} onClose={() => setDialogOpen(false)} />}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "2fa" ? "取消双重验证" : "删除用户"}
        description={
          confirm?.kind === "2fa"
            ? `确定要取消「${confirm?.user.username}」的两步验证吗？该用户下次登录将不再需要验证码。`
            : `确定要删除用户「${confirm?.user.username}」吗？此操作不可撤销。`
        }
        confirmLabel={confirm?.kind === "2fa" ? "取消 2FA" : "删除"}
        destructive={confirm?.kind === "delete"}
        pending={cancel2fa.isPending || removeUser.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === "2fa") void handleCancel2fa(confirm.user)
          else void handleDelete(confirm.user)
        }}
      />
    </AdminSection>
  )
}

function UserFormDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const isEdit = user !== null

  const [username, setUsername] = useState(user?.username ?? "")
  const [password, setPassword] = useState("")
  const [basePath, setBasePath] = useState(user?.base_path ?? "")
  const [role, setRole] = useState<number>(user?.role ?? UserRole.GENERAL)
  const [disabled, setDisabled] = useState(user?.disabled ?? false)
  const [perms, setPerms] = useState<boolean[]>(() =>
    PERMISSIONS.map((_, index) => hasPermission(user?.permission ?? 0, index)),
  )

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? adminApi.userUpdate(payload).then(unwrap) : adminApi.userCreate(payload).then(unwrap),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  })

  const togglePerm = (index: number) =>
    setPerms((prev) => prev.map((value, i) => (i === index ? !value : value)))

  const submit = async () => {
    const name = username.trim()
    if (!name) {
      toast.error("请输入用户名")
      return
    }
    if (!isEdit && !password) {
      toast.error("请输入密码")
      return
    }

    const payload: Record<string, unknown> = {
      username: name,
      base_path: basePath.trim(),
      role,
      permission: buildPermission(perms),
    }
    if (isEdit && user) {
      payload.id = user.id
      payload.disabled = disabled
      if (password) payload.password = password
    } else {
      payload.password = password
    }

    try {
      await save.mutateAsync(payload)
      toast.success(isEdit ? `已更新用户「${name}」` : `已创建用户「${name}」`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑用户" : "添加用户"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `修改「${user.username}」的账户信息与权限` : "创建一个新的 OpenList 账户"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="用户名" required htmlFor="user-username">
              <Input
                id="user-username"
                value={username}
                placeholder="例如：alice"
                onChange={(e) => setUsername(e.target.value)}
              />
            </FormField>
            <FormField
              label="密码"
              required={!isEdit}
              htmlFor="user-password"
              help={isEdit ? "留空表示不修改密码" : undefined}
            >
              <Input
                id="user-password"
                type="password"
                value={password}
                placeholder={isEdit ? "不修改则留空" : "设置登录密码"}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <FormField label="基础路径" htmlFor="user-base-path">
              <Input
                id="user-base-path"
                value={basePath}
                placeholder="/"
                onChange={(e) => setBasePath(e.target.value)}
              />
            </FormField>
            <FormField label="角色" htmlFor="user-role">
              <select
                id="user-role"
                className={SELECT_CLASS}
                value={role}
                onChange={(e) => setRole(Number(e.target.value))}
              >
                <option value={UserRole.GENERAL}>普通用户</option>
                <option value={UserRole.GUEST}>访客</option>
                <option value={UserRole.ADMIN}>管理员</option>
              </select>
            </FormField>
            {isEdit && (
              <FormField label="账户状态" htmlFor="user-disabled">
                <div className="flex h-9 items-center gap-2">
                  <Switch id="user-disabled" checked={disabled} onCheckedChange={setDisabled} />
                  <span className="text-[13px] text-subtle">{disabled ? "已停用" : "正常"}</span>
                </div>
              </FormField>
            )}
          </div>

          <FormField label="权限" help="勾选该用户拥有的权限项">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PERMISSIONS.map((key, index) => (
                <label
                  key={key}
                  htmlFor={`user-perm-${index}`}
                  className="flex cursor-pointer items-center gap-2 rounded-input border border-border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted"
                >
                  <Checkbox
                    id={`user-perm-${index}`}
                    checked={perms[index]}
                    onCheckedChange={() => togglePerm(index)}
                  />
                  <span className="min-w-0 truncate">{PERMISSION_LABELS[index]}</span>
                </label>
              ))}
            </div>
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {save.isPending ? "保存中…" : isEdit ? "保存" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

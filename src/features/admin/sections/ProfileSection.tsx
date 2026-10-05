import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Fingerprint, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { authApi, roleLabel, unwrap } from "@/api"
import type { CurrentUser } from "@/api/types"
import type { AuthnCredential, SSHPublicKey, TwoFAGenerateResp } from "@/api/endpoints"
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
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session"
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminRow,
  AdminSection,
  ConfirmDialog,
  FormField,
} from "../ui"

const errMsg = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const readSsoId = (user: CurrentUser | null): string => {
  const value = (user as unknown as { sso_id?: unknown } | null)?.sso_id
  return typeof value === "string" ? value : ""
}

const patchUser = (patch: Partial<CurrentUser>) =>
  useSessionStore.setState((s) => (s.user ? { user: { ...s.user, ...patch } } : {}))

const formatTime = (value?: string): string => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1) return "—"
  return date.toLocaleString()
}

const qrSource = (data: TwoFAGenerateResp | null): string => {
  if (!data) return ""
  const value = data.qr || data.qrcode || ""
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("http")) return value
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(value)}`
}

const webauthnSupported = (): boolean =>
  typeof (
    globalThis.PublicKeyCredential as unknown as { parseCreationOptionsFromJSON?: unknown } | undefined
  )?.parseCreationOptionsFromJSON === "function"

const parseCreationOptions = (json: unknown): PublicKeyCredentialCreationOptions => {
  const pkc = globalThis.PublicKeyCredential as unknown as {
    parseCreationOptionsFromJSON?: (options: unknown) => PublicKeyCredentialCreationOptions
  }
  if (typeof pkc?.parseCreationOptionsFromJSON !== "function") {
    throw new Error("当前浏览器不支持 WebAuthn 注册")
  }
  return pkc.parseCreationOptionsFromJSON(json)
}

const toBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** 优先用官方 JSON 序列化，兜底手写 base64url 结构。 */
const credentialToJSON = (credential: PublicKeyCredential): unknown => {
  const withJSON = credential as unknown as { toJSON?: () => unknown }
  if (typeof withJSON.toJSON === "function") return withJSON.toJSON()
  const response = credential.response as AuthenticatorAttestationResponse
  const getTransports = (response as unknown as { getTransports?: () => string[] }).getTransports
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: getTransports ? getTransports.call(response) : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[80px] w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-foreground",
        "placeholder:text-subtle/70 transition-colors duration-150 ease-ui",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}

function AccountSection() {
  const user = useSessionStore((s) => s.user)
  const [username, setUsername] = useState(user?.username ?? "")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  useEffect(() => {
    setUsername(user?.username ?? "")
  }, [user?.username])

  const update = useMutation({
    mutationFn: async () => {
      const name = username.trim()
      if (!name) throw new Error("请填写用户名")
      if (password && password !== confirm) throw new Error("两次输入的密码不一致")
      const changedPassword = password !== ""
      await unwrap(
        await authApi.updateMe({
          username: name,
          password,
          sso_id: readSsoId(useSessionStore.getState().user),
        }),
      )
      return { name, changedPassword }
    },
    onSuccess: ({ name, changedPassword }) => {
      patchUser({ username: name })
      setPassword("")
      setConfirm("")
      toast.success("账号信息已更新")
      if (changedPassword) toast.info("密码已修改，建议重新登录以确保会话有效")
    },
    onError: (error) => toast.error(errMsg(error, "保存失败")),
  })

  return (
    <AdminSection title="账号信息" description="查看当前身份并修改用户名与密码">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-subtle">当前用户</span>
          <span className="font-semibold">{user?.username || "-"}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-subtle">
            {roleLabel(user?.role)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="用户名" htmlFor="profile-username" required>
            <Input
              id="profile-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>
          <div className="hidden sm:block" />
          <FormField label="新密码" htmlFor="profile-password" help="留空表示不修改密码">
            <Input
              id="profile-password"
              type="password"
              autoComplete="new-password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <FormField label="确认新密码" htmlFor="profile-confirm" help="需与新密码一致">
            <Input
              id="profile-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="********"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            保存修改
          </Button>
          <span className="text-[11px] text-subtle">修改密码后建议重新登录。</span>
        </div>
      </div>
    </AdminSection>
  )
}

function TwoFactorSection() {
  const user = useSessionStore((s) => s.user)
  const enabled = user?.otp === true
  const [setup, setSetup] = useState<TwoFAGenerateResp | null>(null)
  const [code, setCode] = useState("")

  const generate = useMutation({
    mutationFn: async () => unwrap(await authApi.generate2fa()),
    onSuccess: (data) => setSetup(data),
    onError: (error) => toast.error(errMsg(error, "无法生成两步验证密钥")),
  })

  const verify = useMutation({
    mutationFn: async () => {
      const value = code.trim()
      if (!/^\d{6}$/.test(value)) throw new Error("请输入 6 位数字验证码")
      return unwrap(await authApi.verify2fa(value, setup?.secret ?? ""))
    },
    onSuccess: () => {
      toast.success("两步验证已启用")
      setSetup(null)
      setCode("")
      patchUser({ otp: true })
    },
    onError: (error) => toast.error(errMsg(error, "验证失败")),
  })

  const qrSrc = qrSource(setup)

  return (
    <AdminSection title="两步验证（2FA）" description="使用验证器 App 生成动态验证码，提升账号安全">
      <div className="space-y-3 p-4">
        {enabled ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              已启用
            </span>
            <span className="text-subtle">登录时需输入验证器 App 生成的动态验证码。</span>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-[13px] text-subtle">
              用验证器 App 扫描二维码，或手动输入密钥，然后输入 6 位验证码完成绑定。
            </p>
            <div className="flex flex-wrap items-start gap-4">
              {qrSrc && (
                <img
                  src={qrSrc}
                  alt="两步验证二维码"
                  className="h-40 w-40 rounded-input border border-border bg-surface p-1"
                />
              )}
              <div className="min-w-[240px] flex-1 space-y-3">
                <FormField label="密钥（手动添加）" htmlFor="totp-secret">
                  <code
                    id="totp-secret"
                    className="block break-all rounded-input border border-border bg-muted/40 px-3 py-2 text-[12px]"
                  >
                    {setup.secret}
                  </code>
                </FormField>
                <FormField label="验证码" htmlFor="totp-code" required>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
                    {verify.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    验证并启用
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() => {
                      setSetup(null)
                      setCode("")
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-subtle">启用后，登录时需额外输入验证器 App 生成的 6 位动态验证码。</p>
            <Button variant="primary" size="sm" className="gap-1.5" onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              启用两步验证
            </Button>
            {generate.error && (
              <AdminError
                message={errMsg(generate.error, "无法生成两步验证密钥")}
                onRetry={() => generate.mutate()}
              />
            )}
          </div>
        )}
      </div>
    </AdminSection>
  )
}

function SshKeySection() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [key, setKey] = useState("")
  const [pendingDelete, setPendingDelete] = useState<SSHPublicKey | null>(null)

  const list = useQuery({
    queryKey: ["me", "sshkey"],
    queryFn: () => authApi.sshKeyList(),
    retry: false,
  })
  const keys = list.data?.code === 200 ? list.data.data.content : []
  const firstError = list.data && list.data.code !== 200 ? list.data.message : ""

  const add = useMutation({
    mutationFn: async () => unwrap(await authApi.sshKeyAdd(title.trim(), key.trim())),
    onSuccess: () => {
      toast.success("已添加 SSH 公钥")
      setTitle("")
      setKey("")
      setDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: ["me", "sshkey"] })
    },
    onError: (error) => toast.error(errMsg(error, "添加失败")),
  })

  const remove = useMutation({
    mutationFn: async (id: number | string) => unwrap(await authApi.sshKeyDelete(id)),
    onSuccess: () => {
      toast.success("已删除 SSH 公钥")
      setPendingDelete(null)
      void queryClient.invalidateQueries({ queryKey: ["me", "sshkey"] })
    },
    onError: (error) => toast.error(errMsg(error, "删除失败")),
  })

  const submit = () => {
    if (!title.trim()) {
      toast.error("请填写标题")
      return
    }
    if (!key.trim()) {
      toast.error("请填写公钥内容")
      return
    }
    add.mutate()
  }

  return (
    <AdminSection
      title="SSH 公钥"
      description="用于通过 SSH 访问文件，公钥仅能绑定到当前账号"
      bodyClassName="p-0"
      actions={
        <>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void list.refetch()}>
            <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
            刷新
          </Button>
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            添加公钥
          </Button>
        </>
      }
    >
      {list.isLoading ? (
        <AdminLoading rows={3} />
      ) : firstError ? (
        <AdminError message={firstError} onRetry={() => void list.refetch()} />
      ) : keys.length === 0 ? (
        <AdminEmpty
          message="还没有添加任何 SSH 公钥"
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              添加公钥
            </Button>
          }
        />
      ) : (
        <div>
          {keys.map((item) => (
            <AdminRow key={String(item.id)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-subtle">{item.fingerprint}</span>
                <span className="mt-0.5 block text-[11px] text-subtle">最近使用：{formatTime(item.last_used_time)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive-text hover:text-destructive-text"
                aria-label="删除公钥"
                onClick={() => setPendingDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AdminRow>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(next) => !next && setDialogOpen(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>添加 SSH 公钥</DialogTitle>
            <DialogDescription>粘贴完整的 OpenSSH 格式公钥内容，标题用于区分用途。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="标题" htmlFor="ssh-title" required>
              <Input id="ssh-title" placeholder="例如：我的笔记本" value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="公钥" htmlFor="ssh-key" required help="通常以 ssh-rsa / ssh-ed25519 开头">
              <Textarea id="ssh-key" rows={4} placeholder="ssh-ed25519 AAAA..." value={key} onChange={(e) => setKey(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={add.isPending}>
              取消
            </Button>
            <Button variant="primary" onClick={submit} disabled={add.isPending}>
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete != null}
        title="删除 SSH 公钥"
        description={pendingDelete ? `确定删除公钥「${pendingDelete.title}」吗？删除后将无法再使用该密钥登录。` : ""}
        confirmLabel="删除"
        destructive
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </AdminSection>
  )
}

function WebauthnSection() {
  const queryClient = useQueryClient()
  const supported = webauthnSupported()
  const [pendingDelete, setPendingDelete] = useState<AuthnCredential | null>(null)

  const list = useQuery({
    queryKey: ["me", "authn"],
    queryFn: () => authApi.authnCredentials(),
    retry: false,
  })
  const credentials = list.data?.code === 200 ? list.data.data : []
  const firstError = list.data && list.data.code !== 200 ? list.data.message : ""

  const register = useMutation({
    mutationFn: async () => {
      const begin = unwrap(await authApi.authnBeginRegistration())
      const publicKey = parseCreationOptions(begin.options.publicKey)
      const created = await navigator.credentials.create({ publicKey })
      if (!created) throw new Error("未创建任何凭证")
      return unwrap(await authApi.authnFinishRegistration(begin.session, credentialToJSON(created as PublicKeyCredential)))
    },
    onSuccess: () => {
      toast.success("已注册 WebAuthn 凭证")
      void queryClient.invalidateQueries({ queryKey: ["me", "authn"] })
    },
    onError: (error) => toast.error(errMsg(error, "注册失败")),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await authApi.authnDelete(id)),
    onSuccess: () => {
      toast.success("已删除 WebAuthn 凭证")
      setPendingDelete(null)
      void queryClient.invalidateQueries({ queryKey: ["me", "authn"] })
    },
    onError: (error) => toast.error(errMsg(error, "删除失败")),
  })

  return (
    <AdminSection
      title="WebAuthn 凭证"
      description="使用指纹、面容或安全密钥进行无密码登录"
      bodyClassName="p-0"
      actions={
        <>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void list.refetch()}>
            <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
            刷新
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="gap-1.5"
            disabled={!supported || register.isPending}
            title={supported ? undefined : "当前浏览器不支持 WebAuthn 注册"}
            onClick={() => register.mutate()}
          >
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            注册新凭证
          </Button>
        </>
      }
    >
      {!supported && (
        <AdminError message="当前浏览器不支持 WebAuthn 注册（缺少 parseCreationOptionsFromJSON），注册功能已禁用。" />
      )}
      {list.isLoading ? (
        <AdminLoading rows={3} />
      ) : firstError ? (
        <AdminError message={firstError} onRetry={() => void list.refetch()} />
      ) : credentials.length === 0 ? (
        <AdminEmpty message="还没有注册任何 WebAuthn 凭证" />
      ) : (
        <div>
          {credentials.map((item) => (
            <AdminRow key={item.id}>
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[13px] font-semibold">{item.fingerprint || "未知凭证"}</span>
                <span className="mt-0.5 block break-all text-[11px] text-subtle">ID：{item.id}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive-text hover:text-destructive-text"
                aria-label="删除凭证"
                onClick={() => setPendingDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AdminRow>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="删除 WebAuthn 凭证"
        description="确定删除该凭证吗？删除后将无法用它进行登录。"
        confirmLabel="删除"
        destructive
        pending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </AdminSection>
  )
}

export function ProfileSection() {
  const user = useSessionStore((s) => s.user)

  if (!user) {
    return (
      <AdminSection title="个人资料与安全">
        <AdminEmpty message="当前会话没有用户信息，请重新登录后再试。" />
      </AdminSection>
    )
  }

  return (
    <div className="space-y-4">
      <AccountSection />
      <TwoFactorSection />
      <SshKeySection />
      <WebauthnSection />
    </div>
  )
}

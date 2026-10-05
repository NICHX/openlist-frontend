import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Cloud, Eye, EyeOff, Loader2, LogIn, Moon, ShieldCheck, Sun } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSetting, useSettingsStore } from "@/stores/settings"
import { useSessionStore } from "@/stores/session"
import { useThemeStore } from "@/stores/theme"
import { getSavedUsername, saveUsername } from "@/api/token"

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get("redirect") || "/files"

  const loadSettings = useSettingsStore((s) => s.load)
  const login = useSessionStore((s) => s.login)
  const status = useSessionStore((s) => s.status)
  const guestAllowed = useSessionStore((s) => s.guestAllowed)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const [username, setUsername] = useState(getSavedUsername())
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState("")
  const [needOtp, setNeedOtp] = useState(false)
  const [remember, setRemember] = useState(Boolean(getSavedUsername()))
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (status === "authed") navigate(decodeURIComponent(redirect), { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const submit = async () => {
    if (!username.trim() || (!password && !needOtp)) {
      toast.error("请输入用户名和密码")
      return
    }
    setPending(true)
    const result = await login(username.trim(), password, otp)
    setPending(false)

    if (result.ok) {
      saveUsername(remember ? username.trim() : "")
      toast.success("登录成功")
      navigate(decodeURIComponent(redirect), { replace: true })
      return
    }
    if (result.needOtp) {
      setNeedOtp(true)
      toast.info("请输入两步验证码")
      return
    }
    toast.error(result.message || "登录失败")
  }

  const siteTitle = getSetting("site_title", "OpenList")
  const logo = getSetting("logo")?.split("\n")[0]

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleTheme}
        className="absolute right-4 top-4"
        aria-label="切换主题"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <div className="w-full max-w-[380px] rounded-card border border-border bg-surface p-7 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 object-contain" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-primary/[0.12] text-primary">
              <Cloud className="h-6 w-6" />
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold">{siteTitle}</h1>
            <p className="mt-0.5 text-[13px] text-subtle">登录以管理你的文件</p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-input text-subtle transition-colors hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {needOtp && (
            <div className="space-y-1.5">
              <Label htmlFor="otp" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                两步验证码
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6 位验证码"
                autoFocus
              />
            </div>
          )}

          <label className="flex select-none items-center gap-2 text-[13px] text-subtle">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--primary)]"
            />
            记住用户名
          </label>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>

        {guestAllowed && (
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => navigate("/files", { replace: true })}
            >
              以访客身份浏览
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

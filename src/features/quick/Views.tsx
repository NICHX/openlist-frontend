import { useNavigate } from "react-router-dom"
import {
  Clock,
  Cloud,
  LogOut,
  Moon,
  Share2,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FileTypeIcon } from "@/features/browse/FileTypeIcon"
import { roleLabel } from "@/api/types"
import { useSessionStore, useIsAdmin } from "@/stores/session"
import { usePrefsStore } from "@/stores/prefs"
import { useThemeStore } from "@/stores/theme"
import { getSetting } from "@/stores/settings"

/* ----------------------------- favorites ------------------------------- */

export function FavoritesView() {
  const navigate = useNavigate()
  const favorites = usePrefsStore((s) => s.favorites)
  const toggleFavorite = usePrefsStore((s) => s.toggleFavorite)

  if (favorites.length === 0) {
    return (
      <InfoView
        icon={<Star className="h-7 w-7" />}
        title="还没有收藏"
        desc="在文件浏览页点击星标，即可把常用目录固定到这里。"
        action={
          <Button size="sm" onClick={() => navigate("/files")}>
            去浏览文件
          </Button>
        }
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 md:pb-4">
      <h2 className="mb-3 text-sm font-bold">收藏的目录</h2>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {favorites.map((path) => (
          <div
            key={path}
            className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted"
            onClick={() => navigate(`/files?path=${encodeURIComponent(path)}`)}
          >
            <FileTypeIcon category="folder" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{path.split("/").filter(Boolean).pop() || "根目录"}</p>
              <p className="truncate text-[12px] text-subtle">{path}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="取消收藏"
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(path)
                toast.success("已取消收藏")
              }}
            >
              <Star className="h-4 w-4 fill-accent text-accent" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- recent -------------------------------- */

export function RecentView() {
  const navigate = useNavigate()
  const recent = usePrefsStore((s) => s.recent)
  const clearRecent = usePrefsStore((s) => s.clearRecent)

  if (recent.length === 0) {
    return (
      <InfoView
        icon={<Clock className="h-7 w-7" />}
        title="暂无最近访问"
        desc="打开过的目录会出现在这里，方便快速回到上次的位置。"
        action={
          <Button size="sm" onClick={() => navigate("/files")}>
            去浏览文件
          </Button>
        }
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 md:pb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">最近访问</h2>
        <Button variant="ghost" size="sm" onClick={clearRecent}>
          清空
        </Button>
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {recent.map((path) => (
          <div
            key={path}
            className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted"
            onClick={() => navigate(`/files?path=${encodeURIComponent(path)}`)}
          >
            <FileTypeIcon category="folder" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{path.split("/").filter(Boolean).pop() || "根目录"}</p>
              <p className="truncate text-[12px] text-subtle">{path}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- shares --------------------------------- */

export function SharesView() {
  const navigate = useNavigate()
  return (
    <InfoView
      icon={<Share2 className="h-7 w-7" />}
      title="分享链接"
      desc="在文件列表中选中文件后使用「复制链接」，即可快速获得可直接访问的下载直链。集中管理分享记录依赖 OpenList 后端的分享接口，可在官方管理后台中操作。"
      action={
        <Button size="sm" onClick={() => navigate("/files")}>
          去复制链接
        </Button>
      }
    />
  )
}

export function TrashView() {
  const navigate = useNavigate()
  return (
    <InfoView
      icon={<Trash2 className="h-7 w-7" />}
      title="回收站"
      desc="OpenList 默认不提供统一回收站，删除操作会立即生效。若你的存储挂载了回收站目录，可通过侧栏的云盘直接进入查看。"
      action={
        <Button size="sm" onClick={() => navigate("/files")}>
          返回文件
        </Button>
      }
    />
  )
}

/* ------------------------------ account --------------------------------- */

export function AccountPage() {
  const navigate = useNavigate()
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const logout = useSessionStore((s) => s.logout)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const siteTitle = getSetting("site_title", "OpenList")
  const isAdmin = useIsAdmin()

  const roleText = user ? roleLabel(user.role) : status === "guest" ? "访客" : "—"

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 md:pb-4">
      <div className="mx-auto max-w-[560px] space-y-4">
        <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-5">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/[0.12] text-primary">
            <User className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{user?.username || "访客"}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-subtle">
              <ShieldCheck className="h-3.5 w-3.5" />
              {roleText}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <Row
            icon={<Cloud className="h-4 w-4" />}
            label="站点"
            value={siteTitle}
          />
          <Row
            icon={theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            label="外观"
            value={theme === "dark" ? "深色" : "浅色"}
            action={
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                切换
              </Button>
            }
          />
        </div>

        {isAdmin && (
          <Button variant="outline" className="w-full" onClick={() => navigate("/admin")}>
            <ShieldCheck className="h-4 w-4" />
            管理后台
          </Button>
        )}

        {status === "authed" ? (
          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              await logout()
              toast.success("已退出登录")
              navigate("/login", { replace: true })
            }}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        ) : (
          <Button className="w-full" onClick={() => navigate("/login")}>
            <User className="h-4 w-4" />
            登录账号
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
  action,
}: {
  icon: React.ReactNode
  label: string
  value: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-subtle">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <span className="ml-auto truncate text-[13px] text-subtle">{value}</span>
      {action}
    </div>
  )
}

/* ------------------------------ info view ------------------------------ */

export function InfoView({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-5 py-20 pb-28 text-center md:pb-20">
      <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-muted text-subtle">{icon}</span>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="max-w-[380px] text-[13px] leading-relaxed text-subtle">{desc}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

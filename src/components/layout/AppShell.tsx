import { useMemo, useRef, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  ChevronRight,
  Clock,
  Cloud,
  Folder,
  HardDrive,
  Menu,
  Moon,
  Search,
  Settings,
  Share2,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { normalizePath, toCrumbs } from "@/lib/path"
import { formatBytes } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDrives } from "@/features/browse/hooks"
import { useSessionStore, useIsAdmin } from "@/stores/session"
import { getSetting } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"
import { useUploadStore, activeTaskCount } from "@/stores/upload"
import { filesFromInput } from "@/features/upload/traverse"
import { UploadPanel } from "@/features/upload/UploadPanel"

/** Reads the active folder from `?path=` (shared by the whole shell). */
export function useCurrentPath(): string {
  const [params] = useSearchParams()
  return normalizePath(params.get("path") || "/")
}

const NAV_ITEMS = [
  { to: "/recent", label: "最近访问", icon: Clock },
  { to: "/files", label: "全部文件", icon: Folder, match: ["/files", "/"] },
  { to: "/favorites", label: "收藏", icon: Star },
  { to: "/shares", label: "我的分享", icon: Share2 },
  { to: "/trash", label: "回收站", icon: Trash2 },
] as const

const PAGE_TITLES: Record<string, string> = {
  "/files": "全部文件",
  "/search": "搜索",
  "/favorites": "收藏",
  "/recent": "最近访问",
  "/shares": "我的分享",
  "/trash": "回收站",
  "/account": "我的",
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const currentPath = useCurrentPath()

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-foreground">
      <aside className="hidden w-[264px] shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <SidebarContent currentPath={currentPath} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[var(--overlay)]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] animate-slide-up flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-end p-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(false)} aria-label="关闭菜单">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent currentPath={currentPath} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      <MobileNav />
      <UploadPanel />
    </div>
  )
}

/* ------------------------------ sidebar -------------------------------- */

function SidebarContent({
  currentPath,
  onNavigate,
}: {
  currentPath: string
  onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const siteTitle = getSetting("site_title", "OpenList")
  const logo = getSetting("logo")?.split("\n")[0]

  const isActive = (matches?: readonly string[]) => {
    const targets = matches ?? []
    return targets.some((t) => (t === "/" ? pathname === "/" : pathname.startsWith(t)))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        {logo ? (
          <img src={logo} alt="" className="h-7 w-7 rounded-input object-contain" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-input bg-primary/[0.12] text-primary">
            <Cloud className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{siteTitle}</p>
          <p className="text-[11px] text-subtle">文件管理</p>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="快捷访问">
        <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">快捷访问</p>
        {NAV_ITEMS.map((item) => {
          const active = isActive("match" in item ? item.match : [item.to])
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to === "/files" ? `/files?path=${encodeURIComponent(currentPath)}` : item.to}
              onClick={onNavigate}
              className={cn(
                "flex min-h-[44px] items-center gap-2.5 rounded-input px-2.5 text-sm font-medium transition-colors md:min-h-[40px]",
                active ? "bg-primary/[0.12] font-semibold text-primary" : "text-foreground hover:bg-muted",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-subtle")} strokeWidth={1.7} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <DrivesList onNavigate={onNavigate} />

      <AdminNavItem onNavigate={onNavigate} />
    </div>
  )
}

/** Admin-only entry, pushed to the bottom and separated from normal nav. */
function AdminNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const isAdmin = useIsAdmin()
  if (!isAdmin) return null
  return (
    <div className="mt-auto border-t border-border pt-3">
      <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">管理</p>
      <NavLink
        to="/admin"
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex min-h-[44px] items-center gap-2.5 rounded-input px-2.5 text-sm font-medium transition-colors md:min-h-[40px]",
            isActive ? "bg-primary/[0.12] font-semibold text-primary" : "text-foreground hover:bg-muted",
          )
        }
      >
        {({ isActive }) => (
          <>
            <Settings className={cn("h-[18px] w-[18px]", isActive ? "text-primary" : "text-subtle")} strokeWidth={1.7} />
            管理后台
          </>
        )}
      </NavLink>
    </div>
  )
}

const DRIVE_COLORS = [
  "linear-gradient(135deg,#3B82F6,#2563EB)",
  "linear-gradient(135deg,#F59E0B,#D97706)",
  "linear-gradient(135deg,#10B981,#059669)",
  "linear-gradient(135deg,#8B5CF6,#6D28D9)",
  "linear-gradient(135deg,#EC4899,#BE185D)",
  "linear-gradient(135deg,#06B6D4,#0891B2)",
]

function DrivesList({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { data, isLoading } = useDrives()
  const entries = data?.code === 200 ? (data.data.content ?? []) : []

  const drives = useMemo(() => {
    return entries
      .filter((e) => e.is_dir)
      .map((e, i) => ({
        name: e.name,
        path: `/${e.name}`,
        details: e.mount_details,
        color: DRIVE_COLORS[i % DRIVE_COLORS.length],
      }))
  }, [entries])

  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">我的云盘</p>

      {isLoading &&
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
            <Skeleton className="h-5 w-5 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1 w-full" />
            </div>
          </div>
        ))}

      {!isLoading && drives.length === 0 && (
        <p className="px-2.5 py-2 text-[12px] text-subtle">暂无挂载的存储</p>
      )}

      {drives.map((drive) => {
        const total = drive.details?.total_space ?? 0
        const used = drive.details?.used_space ?? 0
        const hasQuota = total > 0
        const pct = hasQuota ? Math.min(100, Math.round((used / total) * 100)) : 0
        return (
          <button
            key={drive.path}
            type="button"
            title={hasQuota ? `${formatBytes(used)} / ${formatBytes(total)}` : drive.name}
            onClick={() => {
              navigate(`/files?path=${encodeURIComponent(drive.path)}`)
              onNavigate?.()
            }}
            className="group flex items-center gap-2.5 rounded-input px-2.5 py-2 text-left transition-colors hover:bg-muted"
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[9px] font-bold text-white"
              style={{ background: drive.color }}
            >
              {drive.name.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{drive.name}</span>
              {hasQuota ? (
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              ) : (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-subtle">
                  <HardDrive className="h-3 w-3" />
                  {drive.details?.driver_name || "存储"}
                </span>
              )}
            </span>
            {hasQuota && <span className="tnum text-[11px] text-subtle">{pct}%</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------- topbar -------------------------------- */

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentPath = useCurrentPath()
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [keyword, setKeyword] = useState("")
  const showBreadcrumb = pathname === "/files" || pathname === "/"

  const submitSearch = () => {
    const q = keyword.trim()
    if (!q) return
    navigate(`/search?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(q)}`)
  }

  return (
    <header className="flex min-h-[56px] shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenMenu} aria-label="打开菜单">
        <Menu className="h-5 w-5" />
      </Button>

      {showBreadcrumb ? (
        <Breadcrumb path={currentPath} />
      ) : (
        <div className="flex-1 truncate text-sm font-semibold">
          {PAGE_TITLES[pathname] || "全部文件"}
        </div>
      )}

      <label className="hidden h-9 w-[210px] items-center gap-2 rounded-input border border-transparent bg-muted px-2.5 transition-colors focus-within:border-ring focus-within:bg-surface lg:flex">
        <Search className="h-4 w-4 shrink-0 text-subtle" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          placeholder="搜索当前目录…"
          aria-label="搜索当前目录"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle/70"
        />
      </label>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => navigate(`/search?path=${encodeURIComponent(currentPath)}`)}
        className="lg:hidden"
        aria-label="搜索"
      >
        <Search className="h-5 w-5" />
      </Button>

      <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="切换主题">
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <UploadTrigger />
    </header>
  )
}

function Breadcrumb({ path }: { path: string }) {
  const navigate = useNavigate()
  const crumbs = useMemo(() => toCrumbs(path), [path])

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden" aria-label="路径导航">
      {crumbs.map((crumb, i) => {
        const isCurrent = i === crumbs.length - 1
        return (
          <span key={crumb.path} className="flex min-w-0 items-center">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" />}
            <button
              type="button"
              onClick={() => navigate(`/files?path=${encodeURIComponent(crumb.path)}`)}
              className={cn(
                "flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-input px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                isCurrent ? "font-semibold text-foreground" : "font-medium text-subtle",
              )}
              aria-current={isCurrent ? "page" : undefined}
            >
              {i === 0 && <Cloud className="h-3.5 w-3.5" />}
              <span className={cn("truncate", isCurrent ? "" : "max-w-[120px]")}>{crumb.name}</span>
            </button>
          </span>
        )
      })}
    </nav>
  )
}

/* --------------------------- upload trigger ---------------------------- */

function UploadTrigger() {
  const currentPath = useCurrentPath()
  const enqueue = useUploadStore((s) => s.enqueue)
  const tasks = useUploadStore((s) => s.tasks)
  const setPanelOpen = useUploadStore((s) => s.setPanelOpen)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement | null>(null)
  const active = activeTaskCount(tasks)

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    enqueue(filesFromInput(list), currentPath, { rapid: true })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="md" className="relative" aria-label="上传">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">上传</span>
            {active > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent-solid px-1 text-[10px] font-bold text-white">
                {active}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" />
            上传文件
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => dirInput.current?.click()}>
            <Folder className="h-4 w-4" />
            上传文件夹
          </DropdownMenuItem>
          {tasks.length > 0 && (
            <DropdownMenuItem onClick={() => setPanelOpen(true)}>
              <Clock className="h-4 w-4" />
              查看传输列表
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={(el) => {
          dirInput.current = el
          if (el) el.setAttribute("webkitdirectory", "")
        }}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </>
  )
}

/* ---------------------------- mobile nav ------------------------------- */

function MobileNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentPath = useCurrentPath()
  const setPanelOpen = useUploadStore((s) => s.setPanelOpen)
  const tasks = useUploadStore((s) => s.tasks)
  const fileInput = useRef<HTMLInputElement>(null)
  const enqueue = useUploadStore((s) => s.enqueue)
  const status = useSessionStore((s) => s.status)

  const active = activeTaskCount(tasks)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-[64px] items-stretch gap-1 border-t border-border bg-surface px-2 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="主导航"
    >
      <MobileItem
        label="文件"
        icon={<Folder className="h-[22px] w-[22px]" />}
        active={pathname.startsWith("/files")}
        onClick={() => navigate(`/files?path=${encodeURIComponent(currentPath)}`)}
      />
      <MobileItem
        label="搜索"
        icon={<Search className="h-[22px] w-[22px]" />}
        active={pathname.startsWith("/search")}
        onClick={() => navigate(`/search?path=${encodeURIComponent(currentPath)}`)}
      />

      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex w-[56px] shrink-0 flex-col items-center justify-center"
        aria-label="上传文件"
      >
        <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-primary-solid text-white shadow-lg shadow-primary/30">
          <Upload className="h-6 w-6" />
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) enqueue(filesFromInput(e.target.files), currentPath, { rapid: true })
          e.target.value = ""
        }}
      />

      <MobileItem
        label="任务"
        icon={<Clock className="h-[22px] w-[22px]" />}
        badge={active}
        onClick={() => setPanelOpen(true)}
      />
      <MobileItem
        label={status === "authed" ? "我的" : "登录"}
        icon={<Menu className="h-[22px] w-[22px]" />}
        onClick={() => navigate("/account")}
      />
    </nav>
  )
}

function MobileItem({
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active?: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-input text-[11px] font-semibold transition-colors",
        active ? "text-primary" : "text-subtle",
      )}
    >
      {icon}
      {label}
      {badge && badge > 0 ? (
        <span className="absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-solid px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  Database,
  FileArchive,
  HardDrive,
  Info,
  Layers,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  Package,
  Settings,
  Share2,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSetting } from "@/stores/settings"
import { useIsAdmin, useSessionStore } from "@/stores/session"
import { useThemeStore } from "@/stores/theme"
import { InfoView } from "@/features/quick/Views"
import { DashboardSection } from "./sections/DashboardSection"
import { StoragesSection } from "./sections/StoragesSection"
import { UsersSection } from "./sections/UsersSection"
import { SettingsSection } from "./sections/SettingsSection"
import { TasksSection } from "./sections/TasksSection"
import { IndexSection } from "./sections/IndexSection"
import { MetasSection } from "./sections/MetasSection"
import { SharesSection } from "./sections/SharesSection"
import { PluginsSection } from "./sections/PluginsSection"
import { MessengerSection } from "./sections/MessengerSection"
import { BackupSection } from "./sections/BackupSection"
import { ProfileSection } from "./sections/ProfileSection"
import { AboutSection } from "./sections/AboutSection"

type SectionKey =
  | "dashboard"
  | "storages"
  | "users"
  | "metas"
  | "shares"
  | "settings"
  | "tasks"
  | "indexes"
  | "plugins"
  | "messenger"
  | "backup"
  | "profile"
  | "about"

/** 分区导航：按用途分组，避免一长条平铺列表。 */
const NAV_GROUPS: { title?: string; items: { key: SectionKey; label: string; icon: typeof HardDrive }[] }[] = [
  { items: [{ key: "dashboard", label: "概览", icon: LayoutDashboard }] },
  {
    title: "资源管理",
    items: [
      { key: "storages", label: "存储", icon: HardDrive },
      { key: "users", label: "用户", icon: Users },
      { key: "metas", label: "元信息", icon: Layers },
      { key: "shares", label: "分享", icon: Share2 },
    ],
  },
  {
    title: "系统",
    items: [
      { key: "settings", label: "设置", icon: Settings },
      { key: "tasks", label: "任务", icon: ListChecks },
      { key: "indexes", label: "索引", icon: Database },
      { key: "plugins", label: "插件", icon: Package },
      { key: "messenger", label: "消息推送", icon: MessageSquare },
      { key: "backup", label: "备份与恢复", icon: FileArchive },
    ],
  },
  {
    title: "账户",
    items: [
      { key: "profile", label: "个人资料与安全", icon: UserCog },
      { key: "about", label: "关于", icon: Info },
    ],
  },
]

const ALL_KEYS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key))
const sectionLabel = (key: SectionKey) =>
  NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === key)?.label ?? "管理后台"

const isSectionKey = (value: string | null): value is SectionKey =>
  !!value && (ALL_KEYS as string[]).includes(value)

/**
 * 管理后台专用布局：独立于文件管理外壳，只有一条侧栏（避免双重侧边栏）。
 * 分区通过 `?s=` 深链，刷新后仍停留在同一分区。
 */
export function AdminLayout() {
  const [params, setParams] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = useIsAdmin()

  const raw = params.get("s")
  const active: SectionKey = isSectionKey(raw) ? raw : "dashboard"

  const setActive = (key: SectionKey) => {
    const next = new URLSearchParams(params)
    next.set("s", key)
    setParams(next, { replace: true })
    setDrawerOpen(false)
  }

  if (!isAdmin) {
    return (
      <InfoView
        icon={<ShieldCheck className="h-7 w-7" />}
        title="需要管理员权限"
        desc="当前账号不是管理员，无法访问管理后台。请使用管理员账号登录。"
        action={<BackToFilesButton />}
      />
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-foreground">
      <aside className="hidden w-[240px] shrink-0 border-r border-border bg-surface md:block">
        <AdminSidebar active={active} onSelect={setActive} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[268px] max-w-[86vw] flex-col border-r border-border bg-surface">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setDrawerOpen(false)} aria-label="关闭菜单">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <AdminSidebar active={active} onSelect={setActive} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[56px] shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold">{sectionLabel(active)}</h1>
          <AdminThemeToggle />
          <BackToFilesButton compact />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1020px] p-4 pb-24 md:p-6">
            <ActiveSection section={active} onNavigate={(s) => setActive(s as SectionKey)} />
          </div>
        </main>
      </div>
    </div>
  )
}

function ActiveSection({
  section,
  onNavigate,
}: {
  section: SectionKey
  onNavigate: (section: string) => void
}) {
  switch (section) {
    case "storages":
      return <StoragesSection />
    case "users":
      return <UsersSection />
    case "metas":
      return <MetasSection />
    case "shares":
      return <SharesSection />
    case "settings":
      return <SettingsSection />
    case "tasks":
      return <TasksSection />
    case "indexes":
      return <IndexSection />
    case "plugins":
      return <PluginsSection />
    case "messenger":
      return <MessengerSection />
    case "backup":
      return <BackupSection />
    case "profile":
      return <ProfileSection />
    case "about":
      return <AboutSection />
    default:
      return <DashboardSection onNavigate={onNavigate} />
  }
}

function AdminSidebar({ active, onSelect }: { active: SectionKey; onSelect: (key: SectionKey) => void }) {
  const logo = getSetting("logo")?.split("\n")[0]
  const siteTitle = getSetting("site_title", "OpenList")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        {logo ? (
          <img src={logo} alt="" className="h-8 w-8 rounded-input object-contain" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-input bg-primary/[0.12] text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight">管理后台</p>
          <p className="truncate text-[11px] text-subtle">{siteTitle}</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4" aria-label="管理后台导航">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? `g${gi}`} className="space-y-0.5">
            {group.title && (
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-subtle">{group.title}</p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = item.key === active
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full min-h-[38px] items-center gap-2.5 rounded-input px-2.5 text-[13px] font-medium transition-colors",
                    isActive ? "bg-primary/[0.12] font-semibold text-primary" : "text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-subtle")} strokeWidth={1.8} />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3 md:hidden">
        <BackToFilesButton />
      </div>
    </div>
  )
}

function AdminThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="切换主题">
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}

function BackToFilesButton({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const status = useSessionStore((s) => s.status)
  return (
    <Button
      variant={compact ? "outline" : "primary"}
      size={compact ? "sm" : "md"}
      className={cn("gap-1.5", !compact && "w-full")}
      onClick={() => navigate("/files")}
    >
      <ArrowLeft className="h-4 w-4" />
      返回文件
      {!compact && status === "authed" && <span className="ml-auto text-[11px] text-primary-foreground/70">文件浏览</span>}
    </Button>
  )
}

/** 供外部（如设置页）跳转到指定分区。 */
export const ADMIN_SECTION_KEYS = ALL_KEYS

import { lazy, Suspense, useEffect } from "react"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { Cloud, Loader2 } from "lucide-react"
import { UNAUTHORIZED_EVENT } from "@/api"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/layout/AppShell"
import { FileBrowser } from "@/features/browse/FileBrowser"
import { SearchView } from "@/features/search/SearchView"
import {
  AccountPage,
  FavoritesView,
  RecentView,
  SharesView,
  TrashView,
} from "@/features/quick/Views"
import { LoginPage } from "@/features/auth/LoginPage"
import { useSessionStore } from "@/stores/session"
import { useSettingsStore } from "@/stores/settings"
import { useThemeStore } from "@/stores/theme"

/**
 * 管理后台按需加载：它自带中文词条（约 100KB JSON），单独分包可避免拖大主包。
 */
const AdminLayout = lazy(() =>
  import("@/features/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })),
)

function ConnectingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-subtle">
        <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-primary/[0.12] text-primary">
          <Cloud className="h-6 w-6" />
        </span>
        <span className="flex items-center gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在连接 OpenList…
        </span>
      </div>
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Boots the session + public settings, and wires the global 401 handler so an
 * expired token bounces the user back to the login screen automatically.
 */
function Bootstrap({ children }: { children: React.ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const guestAllowed = useSessionStore((s) => s.guestAllowed)
  const bootstrap = useSessionStore((s) => s.bootstrap)
  const loadSettings = useSettingsStore((s) => s.load)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    void loadSettings()
    void bootstrap()
    // Re-assert the persisted theme on first paint.
    setTheme(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the server disables guest access, a visitor with no token must log in
  // instead of seeing an empty shell that bounces off every request.
  useEffect(() => {
    if (status !== "guest" || guestAllowed) return
    if (location.pathname.startsWith("/login")) return
    navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`, {
      replace: true,
    })
  }, [status, guestAllowed, navigate, location.pathname, location.search])

  useEffect(() => {
    const onUnauthorized = () => {
      useSessionStore.getState().reset()
      if (!location.pathname.startsWith("/login")) {
        navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`, {
          replace: true,
        })
      }
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [navigate, location.pathname, location.search])

  const onLoginRoute = location.pathname.startsWith("/login")

  // Hold the shell back while we resolve the session, and while redirecting a
  // visitor to /login on a guest-disabled server — this avoids rendering the
  // browser (and firing unauthenticated requests) for a single frame.
  if (status === "loading" || (status === "guest" && !guestAllowed && !onLoginRoute)) {
    return <ConnectingScreen />
  }

  return <>{children}</>
}

export default function App() {
  const theme = useThemeStore((s) => s.theme)

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Bootstrap>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* 管理后台使用独立布局（单侧栏）+ 按需加载 */}
              <Route
                path="/admin"
                element={
                  <Suspense fallback={<ConnectingScreen />}>
                    <AdminLayout />
                  </Suspense>
                }
              />
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/files" replace />} />
                <Route path="/files" element={<FileBrowser />} />
                <Route path="/search" element={<SearchView />} />
                <Route path="/favorites" element={<FavoritesView />} />
                <Route path="/recent" element={<RecentView />} />
                <Route path="/shares" element={<SharesView />} />
                <Route path="/trash" element={<TrashView />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/files" replace />} />
              </Route>
            </Routes>
          </Bootstrap>
        </BrowserRouter>
        <Toaster
          position="top-center"
          theme={theme}
          richColors
          closeButton
          toastOptions={{ duration: 3500 }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

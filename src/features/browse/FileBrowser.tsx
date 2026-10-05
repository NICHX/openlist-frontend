import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  Eye,
  Filter,
  FolderPlus,
  Grid2x2,
  Inbox,
  List,
  Loader2,
  Lock,
  MoveRight,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { fsApi, type Obj, type OrderBy, type OrderDirection } from "@/api"
import { cn } from "@/lib/utils"
import { formatBytes, formatDate } from "@/lib/format"
import { joinPath } from "@/lib/path"
import { categoryOf, isPreviewable, type FileCategory } from "@/lib/filetype"
import { copyDirectLink, copyText, downloadFile, resolveRawUrl } from "@/lib/download"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FileTypeIcon, kindLabel } from "@/features/browse/FileTypeIcon"
import { useDirectoryList, useFsInvalidate } from "@/features/browse/hooks"
import { OpsDialogs, type OpsRequest } from "@/features/ops/OpsDialogs"
import { PreviewDialog } from "@/features/preview/PreviewDialog"
import { filesFromDataTransfer, filesFromInput } from "@/features/upload/traverse"
import { usePrefsStore } from "@/stores/prefs"
import { useUploadStore } from "@/stores/upload"

const PER_PAGE_OPTIONS = [50, 100, 200, 500]
const VIRTUAL_THRESHOLD = 200

interface FilterOption {
  key: string
  label: string
  match: (category: FileCategory) => boolean
}

const FILTERS: FilterOption[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "folder", label: "文件夹", match: (c) => c === "folder" },
  { key: "video", label: "视频", match: (c) => c === "video" },
  { key: "image", label: "图片", match: (c) => c === "image" },
  { key: "audio", label: "音频", match: (c) => c === "audio" },
  { key: "doc", label: "文档", match: (c) => c === "doc" || c === "text" },
  { key: "archive", label: "压缩包", match: (c) => c === "archive" },
]

const SORT_OPTIONS = ["name", "size", "modified"] as const
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  name: "名称",
  size: "大小",
  modified: "修改时间",
}
const SORT_LABEL_LONG: Record<(typeof SORT_OPTIONS)[number], string> = {
  name: "按名称",
  size: "按大小",
  modified: "按时间",
}

export function FileBrowser() {
  const [params, setParams] = useSearchParams()
  const path = useMemo(() => {
    const raw = params.get("path") || "/"
    const collapsed = raw.replace(/\/+/g, "/")
    return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : "/"
  }, [params])

  const view = usePrefsStore((s) => s.view)
  const setView = usePrefsStore((s) => s.setView)
  const orderBy = usePrefsStore((s) => s.orderBy)
  const orderDirection = usePrefsStore((s) => s.orderDirection)
  const setSort = usePrefsStore((s) => s.setSort)
  const pushRecent = usePrefsStore((s) => s.pushRecent)
  const favorites = usePrefsStore((s) => s.favorites)
  const toggleFavorite = usePrefsStore((s) => s.toggleFavorite)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(100)
  const [typeFilter, setTypeFilter] = useState("all")
  const [password, setPassword] = useState("")
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [focusIndex, setFocusIndex] = useState(-1)
  const [ops, setOps] = useState<OpsRequest | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const completionTick = useUploadStore((s) => s.completionTick)
  const invalidate = useFsInvalidate()

  const query = useDirectoryList(path, { page, perPage, orderBy, orderDirection, password })
  const resp = query.data
  const ok = resp?.code === 200
  const payload = ok ? resp!.data : null
  const allEntries: Obj[] = payload?.content ?? []
  const canWrite = payload ? payload.write !== false : true

  const entries = useMemo(() => {
    const filter = FILTERS.find((f) => f.key === typeFilter) ?? FILTERS[0]
    if (filter.key === "all") return allEntries
    return allEntries.filter((e) => filter.match(categoryOf(e)))
  }, [allEntries, typeFilter])

  const counts = useMemo(() => {
    let folders = 0
    for (const e of allEntries) if (e.is_dir) folders++
    return { folders, files: allEntries.length - folders }
  }, [allEntries])

  const goTo = useCallback(
    (next: string) => {
      setParams({ path: next }, { replace: false })
    },
    [setParams],
  )

  // Reset per-directory UI state when the folder changes.
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
    setSelectMode(false)
    setFocusIndex(-1)
    setPassword("")
    pushRecent(path)
  }, [path, pushRecent])

  // Clamp the page when the folder shrinks.
  useEffect(() => {
    if (!payload) return
    const pages = Math.max(1, Math.ceil(payload.total / perPage))
    if (page > pages) setPage(pages)
  }, [payload, perPage, page])

  // Refresh the listing as soon as an upload finishes.
  useEffect(() => {
    if (completionTick > 0) invalidate()
  }, [completionTick, invalidate])

  const isFavorite = favorites.includes(path)

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setSelectMode(false)
  }, [])

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const openItem = useCallback(
    async (obj: Obj) => {
      const full = joinPath(path, obj.name)
      if (obj.is_dir) {
        goTo(full)
        return
      }
      if (isPreviewable(categoryOf(obj))) {
        setPreview(full)
        return
      }
      try {
        await downloadFile(full, obj.name)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "下载失败")
      }
    },
    [path, goTo],
  )

  const selectedObjects = useMemo(
    () => allEntries.filter((e) => selected.has(e.name)),
    [allEntries, selected],
  )

  const handleDrop = useCallback(
    async (dataTransfer: DataTransfer) => {
      setDragging(false)
      if (!canWrite) {
        toast.error("当前目录不可写入")
        return
      }
      const files = await filesFromDataTransfer(dataTransfer)
      if (files.length === 0) return
      useUploadStore.getState().enqueue(files, path, { rapid: true })
      toast.success(`已加入 ${files.length} 个文件到上传队列`)
    },
    [canWrite, path],
  )

  // Keyboard navigation for the file table.
  const containerRef = useRef<HTMLDivElement>(null)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const max = entries.length - 1
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setFocusIndex((i) => Math.min(i + 1, max))
          break
        case "ArrowUp":
          e.preventDefault()
          setFocusIndex((i) => Math.max(i - 1, 0))
          break
        case "Home":
          e.preventDefault()
          setFocusIndex(0)
          break
        case "End":
          e.preventDefault()
          setFocusIndex(max)
          break
        case "Enter":
          if (focusIndex >= 0 && entries[focusIndex]) {
            e.preventDefault()
            void openItem(entries[focusIndex])
          }
          break
        case " ":
          if (focusIndex >= 0 && entries[focusIndex]) {
            e.preventDefault()
            toggleSelect(entries[focusIndex].name)
          }
          break
        case "Escape":
          clearSelection()
          break
        case "a":
        case "A":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            setSelected(new Set(entries.map((x) => x.name)))
          }
          break
        default:
          break
      }
    },
    [entries, focusIndex, openItem, toggleSelect, clearSelection],
  )

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [focusIndex])

  const toggleSort = (by: OrderBy) => {
    if (orderBy === by) setSort(by, orderDirection === "asc" ? "desc" : "asc")
    else setSort(by, "asc")
  }

  const pages = payload ? Math.max(1, Math.ceil(payload.total / perPage)) : 1

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar
        view={view}
        setView={setView}
        orderBy={orderBy}
        orderDirection={orderDirection}
        onToggleSort={toggleSort}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((m) => !m)
          setSelected(new Set())
        }}
        onRefresh={() => invalidate()}
        refreshing={query.isFetching}
        onMkdir={() => setOps({ kind: "mkdir" })}
        canWrite={canWrite}
        isFavorite={isFavorite}
        onToggleFavorite={() => toggleFavorite(path)}
      />

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-28 outline-none md:pb-4"
        onDragOver={(e) => {
          e.preventDefault()
          if (canWrite) setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          void handleDrop(e.dataTransfer)
        }}
      >
        <SectionHead
          count={`${counts.folders} 个文件夹 · ${counts.files} 个文件`}
          name={path === "/" ? "全部文件" : path.split("/").filter(Boolean).pop() ?? "全部文件"}
        />

        {query.isLoading ? (
          <LoadingSkeleton view={view} />
        ) : !ok ? (
          <PasswordGate
            message={resp?.message || "无法打开此目录"}
            code={resp?.code ?? -1}
            needsPassword={/密码|password/i.test(resp?.message || "")}
            onSubmit={(pwd) => {
              setPassword(pwd)
              void query.refetch()
            }}
            loading={query.isFetching}
          />
        ) : entries.length === 0 ? (
          <EmptyState
            path={path}
            filtered={typeFilter !== "all" && allEntries.length > 0}
            onResetFilter={() => setTypeFilter("all")}
          />
        ) : view === "list" ? (
          <ListView
            entries={entries}
            path={path}
            selected={selected}
            focusIndex={focusIndex}
            orderBy={orderBy}
            orderDirection={orderDirection}
            onToggleSort={toggleSort}
            onOpen={openItem}
            onToggleSelect={toggleSelect}
            onFocus={setFocusIndex}
            onOps={setOps}
            onPreview={setPreview}
            selectMode={selectMode}
            canWrite={canWrite}
          />
        ) : (
          <GridView
            entries={entries}
            path={path}
            selected={selected}
            onOpen={openItem}
            onToggleSelect={toggleSelect}
          />
        )}

        {ok && entries.length > 0 && (
          <DropZone path={path} canWrite={canWrite} visible={getSettingDragHint(entries.length)} />
        )}

        {ok && pages > 1 && (
          <Pagination
            page={page}
            pages={pages}
            total={payload?.total ?? 0}
            perPage={perPage}
            onPage={setPage}
            onPerPage={(n) => {
              setPerPage(n)
              setPage(1)
            }}
          />
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-card border-2 border-dashed border-primary bg-primary/5">
            <div className="rounded-card bg-surface px-4 py-3 text-center shadow-lg">
              <Upload className="mx-auto mb-1 h-6 w-6 text-primary" />
              <p className="text-sm font-semibold">释放以上传到 {path}</p>
            </div>
          </div>
        )}
      </div>

      <BulkBar
        count={selectedObjects.length}
        canWrite={canWrite}
        onClear={clearSelection}
        onMove={() => setOps({ kind: "move", targets: selectedObjects })}
        onDelete={() => setOps({ kind: "delete", targets: selectedObjects })}
        onDownload={async () => {
          const targets = selectedObjects.filter((t) => !t.is_dir).slice(0, 20)
          if (targets.length === 0) return toast.error("所选项目中没有可下载的文件")
          for (const t of targets) {
            try {
              await downloadFile(joinPath(path, t.name), t.name)
            } catch {
              /* continue with the rest */
            }
          }
        }}
        onCopyLinks={async () => {
          const targets = selectedObjects.slice(0, 20)
          const links: string[] = []
          for (const t of targets) {
            try {
              const resp = await fsApi.get(joinPath(path, t.name))
              if (resp.code === 200) links.push(resolveRawUrl(resp.data.raw_url))
            } catch {
              /* skip */
            }
          }
          if (links.length === 0) return toast.error("未能获取任何链接")
          const okCopy = await copyText(links.join("\n"))
          toast[okCopy ? "success" : "error"](okCopy ? `已复制 ${links.length} 个链接` : "复制失败")
        }}
      />

      <OpsDialogs currentPath={path} request={ops} onClose={() => setOps(null)} />
      <PreviewDialog
        path={preview}
        onClose={() => setPreview(null)}
        onDownload={(p, name) => {
          void downloadFile(p, name)
        }}
      />
    </div>
  )
}

/** Only hint at the dropzone for small folders to avoid stealing space. */
const getSettingDragHint = (count: number) => count <= 12

/* ------------------------------- toolbar ------------------------------- */

function Toolbar(props: {
  view: "list" | "grid"
  setView: (v: "list" | "grid") => void
  orderBy: OrderBy
  orderDirection: OrderDirection
  onToggleSort: (by: OrderBy) => void
  typeFilter: string
  setTypeFilter: (k: string) => void
  selectMode: boolean
  onToggleSelectMode: () => void
  onRefresh: () => void
  refreshing: boolean
  onMkdir: () => void
  canWrite: boolean
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  const { view, setView } = props
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setView(view === "list" ? "grid" : "list")}
        aria-label={view === "list" ? "切换到网格视图" : "切换到列表视图"}
        title={view === "list" ? "网格视图" : "列表视图"}
      >
        {view === "list" ? <Grid2x2 className="h-[18px] w-[18px]" /> : <List className="h-[18px] w-[18px]" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowUpDown className="h-4 w-4" />
            {SORT_LABEL_LONG[(props.orderBy || "name") as (typeof SORT_OPTIONS)[number]]}
            {props.orderDirection === "desc" ? " ↓" : " ↑"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>排序方式</DropdownMenuLabel>
          {SORT_OPTIONS.map((by) => (
            <DropdownMenuItem key={by} onClick={() => props.onToggleSort(by)}>
              {SORT_LABEL[by]}
              {props.orderBy === by && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => props.onToggleSort(props.orderBy || "name")}
          >
            {props.orderDirection === "asc" ? "切换为降序" : "切换为升序"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-1.5", props.typeFilter !== "all" && "border-primary text-primary")}>
            <Filter className="h-4 w-4" />
            {FILTERS.find((f) => f.key === props.typeFilter)?.label ?? "类型"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>按类型筛选</DropdownMenuLabel>
          {FILTERS.map((f) => (
            <DropdownMenuItem key={f.key} onClick={() => props.setTypeFilter(f.key)}>
              {f.label}
              {props.typeFilter === f.key && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {props.canWrite && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={props.onMkdir} aria-label="新建文件夹">
          <FolderPlus className="h-4 w-4" />
          <span className="hidden sm:inline">新建文件夹</span>
        </Button>
      )}
      <Button
        variant={props.selectMode ? "primary" : "outline"}
        size="sm"
        className="gap-1.5"
        onClick={props.onToggleSelectMode}
        aria-pressed={props.selectMode}
        aria-label="多选"
      >
        <Check className="h-4 w-4" />
        <span className="hidden sm:inline">多选</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={props.onRefresh}
        aria-label="刷新"
        title="刷新"
      >
        <RefreshCw className={cn("h-[18px] w-[18px]", props.refreshing && "animate-spin")} />
      </Button>
    </div>
  )
}

function SectionHead({ name, count }: { name: string; count: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2 px-0.5">
      <h2 className="text-sm font-bold">{name}</h2>
      <span className="text-xs text-subtle">{count}</span>
    </div>
  )
}

/* ------------------------------- list view ----------------------------- */

interface RowProps {
  entry: Obj
  index: number
  path: string
  isSelected: boolean
  isFocused: boolean
  selected: Set<string>
  orderBy: OrderBy
  orderDirection: OrderDirection
  onToggleSort: (by: OrderBy) => void
  onOpen: (o: Obj) => void
  onToggleSelect: (name: string) => void
  onFocus: (i: number) => void
  onOps: (r: OpsRequest) => void
  onPreview: (p: string) => void
  selectMode: boolean
  canWrite: boolean
}

function FileRow({
  entry,
  index,
  path,
  isSelected,
  isFocused,
  onOpen,
  onToggleSelect,
  onFocus,
  onOps,
  onPreview,
  selectMode,
  canWrite,
}: RowProps) {
  const category = categoryOf(entry)
  const full = joinPath(path, entry.name)
  const isFolder = entry.is_dir

  return (
    <div
      data-index={index}
      role="row"
      tabIndex={-1}
      onClick={() => {
        onFocus(index)
        if (selectMode) onToggleSelect(entry.name)
        else onOpen(entry)
      }}
      onFocus={() => onFocus(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !selectMode) onOpen(entry)
      }}
      className={cn(
        "group grid cursor-pointer grid-cols-[44px_36px_1fr_auto] items-center gap-2 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 md:grid-cols-[28px_36px_1fr_100px_150px_44px]",
        isSelected ? "bg-primary/[0.08]" : "hover:bg-muted",
        isFocused && "ring-2 ring-inset ring-ring/40",
      )}
    >
      <span
        className="grid h-6 w-6 place-items-center max-md:h-11 max-md:w-11"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(entry.name)}
          aria-label={`选择 ${entry.name}`}
        />
      </span>

      <FileTypeIcon category={category} thumb={entry.thumb} size="sm" />

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={entry.name}>
          {entry.name}
        </p>
        <p className="truncate text-[12px] text-subtle md:hidden">
          {isFolder ? kindLabel(category) : `${kindLabel(category)} · ${formatBytes(entry.size)}`}
        </p>
      </div>

      <span className="tnum hidden justify-self-end text-[13px] text-subtle md:block">
        {isFolder ? "—" : formatBytes(entry.size)}
      </span>
      <span className="tnum hidden text-[13px] text-subtle md:block">{formatDate(entry.modified)}</span>

      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <RowActions
          entry={entry}
          fullPath={full}
          canWrite={canWrite}
          onPreview={() => onPreview(full)}
          onOps={onOps}
        />
      </div>
    </div>
  )
}

function RowActions({
  entry,
  fullPath,
  canWrite,
  onPreview,
  onOps,
}: {
  entry: Obj
  fullPath: string
  canWrite: boolean
  onPreview: () => void
  onOps: (r: OpsRequest) => void
}) {
  const previewable = !entry.is_dir && isPreviewable(categoryOf(entry))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0"
          aria-label="更多操作"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {previewable && (
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="h-4 w-4" />
            预览
          </DropdownMenuItem>
        )}
        {!entry.is_dir && (
          <DropdownMenuItem
            onClick={() => void downloadFile(fullPath, entry.name).catch((e) => toast.error(String(e.message || e)))}
          >
            <Download className="h-4 w-4" />
            下载
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() =>
            void copyDirectLink(fullPath)
              .then(() => toast.success("已复制链接"))
              .catch((e) => toast.error(e.message || "复制失败"))
          }
        >
          <Copy className="h-4 w-4" />
          复制链接
        </DropdownMenuItem>
        {canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOps({ kind: "rename", target: entry })}>
              <Pencil className="h-4 w-4" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOps({ kind: "move", targets: [entry] })}>
              <MoveRight className="h-4 w-4" />
              移动
            </DropdownMenuItem>
            <DropdownMenuItem destructive onClick={() => onOps({ kind: "delete", targets: [entry] })}>
              <Trash2 className="h-4 w-4" />
              删除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ListHeader({
  orderBy,
  orderDirection,
  onToggleSort,
}: {
  orderBy: OrderBy
  orderDirection: OrderDirection
  onToggleSort: (by: OrderBy) => void
}) {
  const arrow = (by: OrderBy) => (orderBy === by ? (orderDirection === "asc" ? " ↑" : " ↓") : "")
  return (
    <div className="hidden grid-cols-[28px_36px_1fr_100px_150px_44px] items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-subtle md:grid">
      <span />
      <span />
      <button type="button" className="text-left hover:text-foreground" onClick={() => onToggleSort("name")}>
        名称{arrow("name")}
      </button>
      <button type="button" className="text-right hover:text-foreground" onClick={() => onToggleSort("size")}>
        大小{arrow("size")}
      </button>
      <button type="button" className="text-left hover:text-foreground" onClick={() => onToggleSort("modified")}>
        修改时间{arrow("modified")}
      </button>
      <span />
    </div>
  )
}

function ListView(props: {
  entries: Obj[]
  path: string
  selected: Set<string>
  focusIndex: number
  orderBy: OrderBy
  orderDirection: OrderDirection
  onToggleSort: (by: OrderBy) => void
  onOpen: (o: Obj) => void
  onToggleSelect: (name: string) => void
  onFocus: (i: number) => void
  onOps: (r: OpsRequest) => void
  onPreview: (p: string) => void
  selectMode: boolean
  canWrite: boolean
}) {
  const { entries } = props
  const wrapClass = "overflow-hidden rounded-card border border-border bg-surface"

  if (entries.length > VIRTUAL_THRESHOLD) {
    return (
      <div className={wrapClass}>
        <ListHeader {...props} />
        <VirtualRows {...props} />
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      <ListHeader {...props} />
      {entries.map((entry, index) => (
        <FileRow
          key={entry.name}
          {...props}
          entry={entry}
          index={index}
          isSelected={props.selected.has(entry.name)}
          isFocused={props.focusIndex === index}
        />
      ))}
    </div>
  )
}

/** Virtualised body for very large directories (>200 rows). */
function VirtualRows(props: {
  entries: Obj[]
  selected: Set<string>
  focusIndex: number
  path: string
  orderBy: OrderBy
  orderDirection: OrderDirection
  onToggleSort: (by: OrderBy) => void
  onOpen: (o: Obj) => void
  onToggleSelect: (name: string) => void
  onFocus: (i: number) => void
  onOps: (r: OpsRequest) => void
  onPreview: (p: string) => void
  selectMode: boolean
  canWrite: boolean
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowHeight = 58
  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  return (
    <div ref={parentRef} className="max-h-[70dvh] overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const entry = props.entries[item.index]
          return (
            <div
              key={entry.name}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
            >
              <FileRow
                {...props}
                entry={entry}
                index={item.index}
                isSelected={props.selected.has(entry.name)}
                isFocused={props.focusIndex === item.index}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------- grid view ----------------------------- */

function GridView({
  entries,
  selected,
  onOpen,
  onToggleSelect,
}: {
  entries: Obj[]
  path: string
  selected: Set<string>
  onOpen: (o: Obj) => void
  onToggleSelect: (name: string) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      {entries.map((entry) => {
        const category = categoryOf(entry)
        const isSelected = selected.has(entry.name)
        return (
          <div
            key={entry.name}
            className={cn(
              "group relative rounded-card border bg-surface transition-all duration-150 ease-ui hover:-translate-y-0.5 hover:border-primary",
              isSelected ? "border-primary bg-primary/[0.06]" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(entry)}
              className="flex w-full flex-col items-center rounded-card px-3 pb-3 pt-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileTypeIcon category={category} thumb={entry.thumb} size="lg" className="mb-3" />
              <span className="w-full truncate text-[13px] font-semibold" title={entry.name}>
                {entry.name}
              </span>
              <span className="tnum mt-1 text-[11px] text-subtle">
                {entry.is_dir ? kindLabel(category) : formatBytes(entry.size)}
              </span>
            </button>

            <span
              className="absolute left-1 top-1 z-10 grid h-10 w-10 place-items-center md:left-2 md:top-2 md:h-8 md:w-8"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(entry.name)}
                aria-label={`选择 ${entry.name}`}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------ bulk bar ------------------------------- */

function BulkBar({
  count,
  canWrite,
  onClear,
  onDownload,
  onCopyLinks,
  onMove,
  onDelete,
}: {
  count: number
  canWrite: boolean
  onClear: () => void
  onDownload: () => void
  onCopyLinks: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const visible = count > 0
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[72px] z-30 flex justify-center px-4 transition-all duration-200 ease-ui md:bottom-6",
        visible ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0",
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground px-2 py-1.5 pl-4 text-surface shadow-2xl">
        <span className="mr-1 text-[13px] font-semibold">
          已选 <span className="tnum">{count}</span> 项
        </span>
        <Button variant="ghost" size="sm" className="gap-1.5 text-surface hover:bg-white/15 hover:text-surface" onClick={onDownload}>
          <Download className="h-4 w-4" />
          下载
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-surface hover:bg-white/15 hover:text-surface" onClick={onCopyLinks}>
          <Copy className="h-4 w-4" />
          复制链接
        </Button>
        {canWrite && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-surface hover:bg-white/15 hover:text-surface" onClick={onMove}>
            <MoveRight className="h-4 w-4" />
            移动
          </Button>
        )}
        {canWrite && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-red-300 hover:bg-white/15 hover:text-red-200 dark:text-red-700 dark:hover:text-red-800"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-surface hover:bg-white/15 hover:text-surface"
          onClick={onClear}
          aria-label="取消选择"
        >
          取消
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------ pagination ----------------------------- */

function Pagination({
  page,
  pages,
  total,
  perPage,
  onPage,
  onPerPage,
}: {
  page: number
  pages: number
  total: number
  perPage: number
  onPage: (p: number) => void
  onPerPage: (n: number) => void
}) {
  const numbers = useMemo(() => {
    const out: number[] = []
    const start = Math.max(1, Math.min(page - 2, pages - 4))
    const end = Math.min(pages, start + 4)
    for (let i = start; i <= end; i++) out.push(i)
    return out
  }, [page, pages])

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </Button>
      {numbers.map((n) => (
        <Button
          key={n}
          variant={n === page ? "primary" : "outline"}
          size="sm"
          className="tnum min-w-9"
          onClick={() => onPage(n)}
        >
          {n}
        </Button>
      ))}
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="tnum ml-2">
            每页 {perPage} 项
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>每页数量（共 {total} 项）</DropdownMenuLabel>
          {PER_PAGE_OPTIONS.map((n) => (
            <DropdownMenuItem key={n} onClick={() => onPerPage(n)}>
              {n}
              {n === perPage && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* ------------------------------ states --------------------------------- */

function LoadingSkeleton({ view }: { view: "list" | "grid" }) {
  if (view === "grid") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-card border border-border bg-surface p-4">
            <Skeleton className="mx-auto mb-3 h-[52px] w-[52px] rounded-[13px]" />
            <Skeleton className="mx-auto h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-[58px] rounded-card" />
      ))}
    </div>
  )
}

function EmptyState({
  path,
  filtered,
  onResetFilter,
}: {
  path: string
  filtered: boolean
  onResetFilter: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-muted text-subtle">
        <Inbox className="h-7 w-7" />
      </span>
      <h3 className="text-base font-bold">{filtered ? "没有符合筛选条件的项目" : "这个文件夹是空的"}</h3>
      <p className="max-w-[340px] text-[13px] leading-relaxed text-subtle">
        {filtered
          ? "试试切换筛选类型，或查看全部文件。"
          : "把文件拖到此处，或点击右上角「上传」按钮，即可传到当前目录。"}
      </p>
      {filtered ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onResetFilter}>
          清除筛选
        </Button>
      ) : (
        <label className="mt-2">
          <input
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files
              if (files?.length) {
                useUploadStore.getState().enqueue(filesFromInput(files), path, { rapid: true })
              }
              e.target.value = ""
            }}
          />
          <Button size="sm" asChild>
            <span>
              <Upload className="h-4 w-4" />
              上传文件
            </span>
          </Button>
        </label>
      )}
    </div>
  )
}

function PasswordGate({
  message,
  needsPassword,
  onSubmit,
  loading,
}: {
  message: string
  code?: number
  needsPassword: boolean
  onSubmit: (password: string) => void
  loading: boolean
}) {
  const [value, setValue] = useState("")
  return (
    <div className="mx-auto flex max-w-[360px] flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-muted text-subtle">
        <Lock className="h-6 w-6" />
      </span>
      <h3 className="text-base font-bold">{needsPassword ? "此目录需要密码" : "无法打开此目录"}</h3>
      <p className="text-[13px] text-subtle">{message}</p>
      {needsPassword && (
        <div className="mt-1 flex w-full gap-2">
          <Input
            type="password"
            value={value}
            autoFocus
            placeholder="请输入访问密码"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value && onSubmit(value)}
          />
          <Button onClick={() => value && onSubmit(value)} disabled={loading || !value}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "确定"}
          </Button>
        </div>
      )}
    </div>
  )
}

function DropZone({ path, canWrite, visible }: { path: string; canWrite: boolean; visible: boolean }) {
  const [hot, setHot] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  if (!canWrite || !visible) return null

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setHot(true)
      }}
      onDragLeave={() => setHot(false)}
      onDrop={() => setHot(false)}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "mt-4 flex cursor-pointer items-center gap-3 rounded-card border border-dashed bg-surface px-4 py-3.5 transition-colors",
        hot ? "border-primary bg-primary/5 text-primary" : "border-border text-subtle hover:border-primary hover:text-primary",
      )}
    >
      <Upload className="h-6 w-6 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">拖拽文件到这里上传</p>
        <p className="text-[12px]">支持大文件分片、断点续传与秒传；也可点击选择文件或文件夹</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files
          if (files?.length) {
            useUploadStore.getState().enqueue(filesFromInput(files), path, { rapid: true })
          }
          e.target.value = ""
        }}
      />
    </div>
  )
}

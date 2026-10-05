import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Download, Eye, FolderSearch, Info, Search } from "lucide-react"
import { toast } from "sonner"
import { fsApi, type SearchNode } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { FileTypeIcon } from "@/features/browse/FileTypeIcon"
import { categoryOf, isPreviewable } from "@/lib/filetype"
import { formatBytes } from "@/lib/format"
import { dirname, normalizePath } from "@/lib/path"
import { downloadFile } from "@/lib/download"
import { cn } from "@/lib/utils"
import { PreviewDialog } from "@/features/preview/PreviewDialog"

const PER_PAGE = 100

export function SearchView() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const parent = normalizePath(params.get("path") || "/")
  const urlQuery = params.get("q") || ""

  const [keyword, setKeyword] = useState(urlQuery)
  const [scope, setScope] = useState(0)
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => setKeyword(urlQuery), [urlQuery])
  useEffect(() => setPage(1), [urlQuery, scope])

  const enabled = urlQuery.trim().length > 0
  const query = useQuery({
    queryKey: ["fs", "search", { parent, urlQuery, scope, page }],
    queryFn: ({ signal }) =>
      fsApi.search({ parent, keywords: urlQuery, scope, page, per_page: PER_PAGE }, signal),
    enabled,
    placeholderData: (prev) => prev,
    retry: false,
  })

  const ok = query.data?.code === 200
  const results: SearchNode[] = ok ? (query.data!.data.content ?? []) : []
  const total = ok ? query.data!.data.total : 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const serverMessage = query.data && !ok ? query.data.message : ""

  const submit = (value: string) => {
    const next = new URLSearchParams(params)
    if (value.trim()) next.set("q", value.trim())
    else next.delete("q")
    setParams(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              submit(keyword)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索文件名…"
              className="pl-9"
              aria-label="搜索关键词"
            />
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-1">
          <span className="text-[12px] text-subtle">搜索范围</span>
          {[
            { value: 0, label: "当前目录" },
            { value: 1, label: "所有目录" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                scope === option.value
                  ? "border-transparent bg-primary/[0.12] font-semibold text-primary"
                  : "border-border text-subtle hover:border-primary hover:text-primary",
              )}
              aria-pressed={scope === option.value}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-subtle">
            {!enabled ? "输入关键词开始搜索" : ok ? `${total} 个结果` : "搜索不可用"}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!enabled ? (
          <CenterHint icon={<FolderSearch className="h-7 w-7" />} title="搜索你的文件" desc="输入文件名关键词，可切换在当前目录或所有目录中搜索。" />
        ) : query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[54px] rounded-card" />
            ))}
          </div>
        ) : !ok ? (
          <CenterHint
            icon={<Info className="h-7 w-7" />}
            title="搜索在此服务器上不可用"
            desc={`服务器返回「${serverMessage || "search not available"}」。OpenList 的搜索依赖后端索引，请在管理后台开启并建立搜索索引后再试。`}
          />
        ) : results.length === 0 ? (
          <CenterHint icon={<FolderSearch className="h-7 w-7" />} title="没有找到匹配的文件" desc={`未找到与「${urlQuery}」相关的结果，试试其它关键词。`} />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {results.map((node) => (
              <ResultRow
                key={node.path}
                node={node}
                onOpen={() => {
                  const parentDir = dirname(node.path)
                  navigate(`/files?path=${encodeURIComponent(parentDir)}`)
                }}
                onPreview={() => setPreview(node.path)}
              />
            ))}
          </div>
        )}

        {enabled && pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span className="tnum text-[13px] text-subtle">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        )}
      </div>

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

function ResultRow({
  node,
  onOpen,
  onPreview,
}: {
  node: SearchNode
  onOpen: () => void
  onPreview: () => void
}) {
  const category = categoryOf({ name: node.name, is_dir: node.is_dir, type: node.type })
  const previewable = !node.is_dir && isPreviewable(category)

  return (
    <div
      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted"
      onClick={onOpen}
    >
      <FileTypeIcon category={category} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={node.name}>
          {node.name}
        </p>
        <p className="truncate text-[12px] text-subtle" title={node.path}>
          {dirname(node.path)}
        </p>
      </div>
      <span className="tnum hidden text-[13px] text-subtle sm:block">
        {node.is_dir ? "—" : formatBytes(node.size)}
      </span>
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {previewable && (
          <Button variant="ghost" size="icon-sm" onClick={onPreview} aria-label="预览">
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {!node.is_dir && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="下载"
            onClick={() =>
              void downloadFile(node.path, node.name).catch((e) => toast.error(String(e.message || e)))
            }
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function CenterHint({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-20 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-muted text-subtle">{icon}</span>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="max-w-[360px] text-[13px] leading-relaxed text-subtle">{desc}</p>
    </div>
  )
}

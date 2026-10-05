import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Folder, HardDrive, Loader2, MoveRight, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"
import { fsApi } from "@/api"
import type { DirectoryNode, Obj } from "@/api/types"
import { joinPath, toCrumbs } from "@/lib/path"
import { cn } from "@/lib/utils"
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
import { Label } from "@/components/ui/label"
import { useFsMutations } from "@/features/browse/hooks"

export type OpsRequest =
  | { kind: "mkdir" }
  | { kind: "rename"; target: Obj }
  | { kind: "move"; targets: Obj[] }
  | { kind: "delete"; targets: Obj[] }

interface OpsDialogsProps {
  currentPath: string
  request: OpsRequest | null
  onClose: () => void
}

export function OpsDialogs({ currentPath, request, onClose }: OpsDialogsProps) {
  if (!request) return null
  if (request.kind === "mkdir") return <MkdirDialog currentPath={currentPath} onClose={onClose} />
  if (request.kind === "rename")
    return <RenameDialog currentPath={currentPath} target={request.target} onClose={onClose} />
  if (request.kind === "move")
    return <MoveDialog currentPath={currentPath} targets={request.targets} onClose={onClose} />
  return <DeleteDialog currentPath={currentPath} targets={request.targets} onClose={onClose} />
}

function busyLabel(pending: boolean, idle: string) {
  return pending ? "处理中…" : idle
}

/* ------------------------------- mkdir --------------------------------- */

function MkdirDialog({ currentPath, onClose }: { currentPath: string; onClose: () => void }) {
  const { mkdir } = useFsMutations()
  const [name, setName] = useState("")

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await mkdir.mutateAsync(joinPath(currentPath, trimmed))
      toast.success(`已创建文件夹「${trimmed}」`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>在 {currentPath === "/" ? "根目录" : currentPath} 下创建</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="mkdir-name">文件夹名称</Label>
          <Input
            id="mkdir-name"
            autoFocus
            value={name}
            placeholder="例如：影视资源"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={!name.trim() || mkdir.isPending}>
            {mkdir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {busyLabel(mkdir.isPending, "创建")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ rename --------------------------------- */

function RenameDialog({
  currentPath,
  target,
  onClose,
}: {
  currentPath: string
  target: Obj
  onClose: () => void
}) {
  const { rename } = useFsMutations()
  const [name, setName] = useState(target.name)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === target.name) return onClose()
    try {
      await rename.mutateAsync({ path: joinPath(currentPath, target.name), name: trimmed })
      toast.success("重命名成功")
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-subtle" />
            重命名
          </DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rename-name">新名称</Label>
          <Input
            id="rename-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={!name.trim() || rename.isPending}>
            {rename.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {busyLabel(rename.isPending, "保存")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- move ---------------------------------- */

function DirPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (path: string) => void
}) {
  const [browsePath, setBrowsePath] = useState("/")
  const { data, isLoading } = useQuery({
    queryKey: ["fs", "dirs", "picker", browsePath],
    queryFn: () => fsApi.dirs(browsePath, "", false),
    staleTime: 30_000,
    retry: false,
  })

  const dirs = data?.code === 200 ? ((data.data as DirectoryNode[] | null) ?? []) : []
  const crumbs = useMemo(() => toCrumbs(browsePath), [browsePath])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-input border border-border bg-muted/50 px-2 py-1.5 text-[13px]">
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-subtle" />}
            <button
              type="button"
              onClick={() => setBrowsePath(crumb.path)}
              className={cn(
                "rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-surface",
                i === crumbs.length - 1 ? "text-foreground" : "text-subtle",
              )}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="h-56 overflow-y-auto rounded-input border border-border">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-subtle">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : dirs.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center text-[13px] text-subtle">
            此处没有子文件夹
          </div>
        ) : (
          <ul className="p-1">
            {dirs.map((dir) => (
              <li key={dir.name}>
                <button
                  type="button"
                  onClick={() => setBrowsePath(joinPath(browsePath, dir.name))}
                  className="flex w-full items-center gap-2.5 rounded-input px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  <Folder className="h-4 w-4 shrink-0 text-folder" strokeWidth={1.8} />
                  <span className="truncate">{dir.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        variant={value === browsePath ? "primary" : "outline"}
        size="sm"
        className="w-full"
        onClick={() => onChange(browsePath)}
      >
        <HardDrive className="h-4 w-4" />
        {value === browsePath ? "已选择此文件夹" : `选择 ${browsePath === "/" ? "根目录" : browsePath}`}
      </Button>
    </div>
  )
}

function MoveDialog({
  currentPath,
  targets,
  onClose,
}: {
  currentPath: string
  targets: Obj[]
  onClose: () => void
}) {
  const { move } = useFsMutations()
  const [dest, setDest] = useState(currentPath)

  const submit = async () => {
    if (dest === currentPath) {
      toast.error("目标目录与当前目录相同")
      return
    }
    try {
      await move.mutateAsync({
        srcDir: currentPath,
        dstDir: dest,
        names: targets.map((t) => t.name),
      })
      toast.success(`已移动 ${targets.length} 项`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移动失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoveRight className="h-4 w-4 text-subtle" />
            移动到
          </DialogTitle>
          <DialogDescription>已选择 {targets.length} 项</DialogDescription>
        </DialogHeader>
        <DirPicker value={dest} onChange={setDest} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={move.isPending}>
            {move.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {busyLabel(move.isPending, "移动")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ delete --------------------------------- */

function DeleteDialog({
  currentPath,
  targets,
  onClose,
}: {
  currentPath: string
  targets: Obj[]
  onClose: () => void
}) {
  const { remove } = useFsMutations()
  const [confirmText, setConfirmText] = useState("")

  useEffect(() => setConfirmText(""), [targets])

  const submit = async () => {
    try {
      await remove.mutateAsync({ dir: currentPath, names: targets.map((t) => t.name) })
      toast.success(`已删除 ${targets.length} 项`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败")
    }
  }

  const total = targets.length

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive-text">
            <Trash2 className="h-4 w-4" />
            确认删除
          </DialogTitle>
          <DialogDescription>
            将永久删除 {total} 项，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-32 space-y-1 overflow-y-auto rounded-input border border-border bg-muted/40 p-2 text-[13px]">
          {targets.slice(0, 50).map((t) => (
            <li key={t.name} className="truncate">
              {t.name}
            </li>
          ))}
          {total > 50 && <li className="text-subtle">…以及其余 {total - 50} 项</li>}
        </ul>

        {total > 1 && (
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">输入 DELETE 以确认批量删除</Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              placeholder="DELETE"
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={remove.isPending || (total > 1 && confirmText !== "DELETE")}
          >
            {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busyLabel(remove.isPending, "删除")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

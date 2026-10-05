import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Copy, Download, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { adminApi, shareApi, unwrap } from "@/api"
import type {
  AdminMeta,
  AdminShare,
  AdminStorage,
  AdminUser,
  PageResp,
  SettingItem,
} from "@/api/types"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/download"
import { AdminSection, ConfirmDialog, SectionNote } from "../ui"

interface BackupFile {
  format: "openlist-frontend-backup"
  version: number
  exported_at: string
  settings: SettingItem[]
  storages: AdminStorage[]
  users: AdminUser[]
  metas: AdminMeta[]
  shares: AdminShare[]
}

const pageItems = <T,>(resp: PageResp<T>): T[] =>
  resp.code === 200 ? (resp.data.content ?? []) : []

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const pushError = (
  resp: { code: number; message: string },
  label: string,
  out: string[],
): void => {
  if (resp.code !== 200) out.push(`${label}：${resp.message || "加载失败"}`)
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const nowStamp = (): string => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function BackupSection() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState<BackupFile | null>(null)

  const handleExport = async (mode: "download" | "copy") => {
    setExporting(true)
    try {
      const [settingsRes, storagesRes, usersRes, metasRes, sharesRes] = await Promise.all([
        adminApi.settingList(),
        adminApi.storageList(),
        adminApi.userList(),
        adminApi.metaList(),
        shareApi.list(),
      ])
      const failures: string[] = []
      pushError(settingsRes, "设置", failures)
      pushError(storagesRes, "存储", failures)
      pushError(usersRes, "用户", failures)
      pushError(metasRes, "元信息", failures)
      pushError(sharesRes, "分享", failures)

      const backup: BackupFile = {
        format: "openlist-frontend-backup",
        version: 1,
        exported_at: new Date().toISOString(),
        settings: settingsRes.code === 200 ? (settingsRes.data ?? []) : [],
        storages: pageItems(storagesRes),
        users: pageItems(usersRes),
        metas: pageItems(metasRes),
        shares: pageItems(sharesRes),
      }
      const text = JSON.stringify(backup, null, 2)

      if (mode === "download") {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
        const a = document.createElement("a")
        a.href = url
        a.download = `openlist-backup-${nowStamp()}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("备份已导出")
      } else {
        const ok = await copyText(text)
        if (ok) toast.success("备份已复制到剪贴板")
        else toast.error("复制失败，请改用下载")
      }
      if (failures.length) toast.warning(`部分数据未导出：${failures.join("；")}`)
    } finally {
      setExporting(false)
    }
  }

  const loadFile = async (file: File) => {
    try {
      const raw: unknown = JSON.parse(await file.text())
      if (typeof raw !== "object" || raw === null) {
        toast.error("不是有效的备份文件")
        return
      }
      const obj = raw as Record<string, unknown>
      const hasKnown = ["settings", "storages", "users", "metas", "shares"].some((k) =>
        Array.isArray(obj[k]),
      )
      if (!hasKnown) {
        toast.error("不是有效的备份文件")
        return
      }
      setPending({
        format: "openlist-frontend-backup",
        version: 1,
        exported_at: typeof obj.exported_at === "string" ? obj.exported_at : "",
        settings: toArray<SettingItem>(obj.settings),
        storages: toArray<AdminStorage>(obj.storages),
        users: toArray<AdminUser>(obj.users),
        metas: toArray<AdminMeta>(obj.metas),
        shares: toArray<AdminShare>(obj.shares),
      })
    } catch {
      toast.error("读取备份文件失败")
    }
  }

  const handleRestore = async () => {
    if (!pending) return
    setImporting(true)
    let success = 0
    let fail = 0
    const errors: string[] = []

    for (const item of pending.settings) {
      if (item.key === "version" || item.key === "index_progress") continue
      try {
        unwrap(await adminApi.settingSave([{ key: item.key, value: item.value }]))
        success++
      } catch (e) {
        fail++
        errors.push(`${item.key}：${errText(e)}`)
      }
    }

    for (const storage of pending.storages) {
      try {
        const payload: Record<string, unknown> = { ...storage }
        delete payload.id
        delete payload.status
        delete payload.modified
        delete payload.mount_details
        unwrap(await adminApi.storageCreate(payload))
        success++
      } catch (e) {
        fail++
        errors.push(`${storage.mount_path}：${errText(e)}`)
      }
    }

    const skipped = pending.users.length + pending.metas.length + pending.shares.length
    setImporting(false)
    setPending(null)
    await queryClient.invalidateQueries({ queryKey: ["admin"] })

    const summary = `导入完成：成功 ${success} 项 / 失败 ${fail} 项`
    if (fail === 0) toast.success(summary)
    else toast.warning(summary, { description: errors.slice(0, 3).join("；") })
    if (skipped > 0) toast.info(`用户 / 元信息 / 分享共 ${skipped} 项仅预览，需手动处理`)
  }

  const preview = pending
    ? `设置 ${pending.settings.length} 项、存储 ${pending.storages.length} 项将自动写入；用户 ${pending.users.length} 项、元信息 ${pending.metas.length} 项、分享 ${pending.shares.length} 项仅预览，需手动处理。此操作会覆盖同名设置，且无法撤销。`
    : ""

  return (
    <AdminSection
      title="备份与恢复"
      description="导出当前数据为 JSON，或从备份文件恢复"
      bodyClassName="space-y-4 p-4"
    >
      <SectionNote>
        这是前端侧导出 / 导入，基于现有管理接口拼装数据，不等同于官方数据库级备份，请勿用于跨版本迁移或数据库还原。
      </SectionNote>

      <div className="space-y-2">
        <h4 className="text-[13px] font-semibold">导出备份</h4>
        <p className="text-[12px] leading-relaxed text-subtle">
          汇总设置、存储、用户、元信息与分享为一个 JSON 文件。
        </p>
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-destructive-text">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          导出内容包含密码、密钥、配置等敏感信息，请妥善保管，切勿公开分享。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="gap-1.5"
            disabled={exporting}
            onClick={() => void handleExport("download")}
            aria-label="导出并下载备份"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            导出并下载
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={exporting}
            onClick={() => void handleExport("copy")}
            aria-label="复制备份到剪贴板"
          >
            <Copy className="h-4 w-4" />
            复制到剪贴板
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <h4 className="text-[13px] font-semibold">导入恢复</h4>
        <p className="text-[12px] leading-relaxed text-subtle">
          仅自动回写「设置」与「存储」；用户、元信息、分享仅预览，需手动处理。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void loadFile(file)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            aria-label="选择备份文件"
          >
            <Upload className="h-4 w-4" />
            选择备份文件
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="确认导入备份？"
        description={preview}
        confirmLabel="导入"
        pending={importing}
        onCancel={() => setPending(null)}
        onConfirm={() => void handleRestore()}
      />
    </AdminSection>
  )
}

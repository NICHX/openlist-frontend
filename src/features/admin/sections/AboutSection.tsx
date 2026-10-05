import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getSetting } from "@/stores/settings"
import { AdminSection, SectionNote } from "../ui"

const LINKS = [
  { label: "OpenList 仓库", url: "https://github.com/OpenListTeam/OpenList" },
  { label: "官方文档", url: "https://doc.oplist.org/" },
  { label: "配置说明", url: "https://doc.oplist.org/configuration/configuration" },
]

export function AboutSection() {
  const version = getSetting("version", "未知")
  const siteTitle = getSetting("site_title", "OpenList")

  return (
    <div className="space-y-4">
      <AdminSection title="关于">
        <div className="space-y-3 p-4 text-[13px]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-input bg-primary/[0.12] text-primary">
              <span className="text-sm font-bold">OL</span>
            </span>
            <div>
              <p className="font-bold">{siteTitle}</p>
              <p className="tnum text-[12px] text-subtle">{version}</p>
            </div>
          </div>
          <p className="leading-relaxed text-subtle">
            本界面是 OpenList 的第三方静态前端（React + TypeScript + Vite），通过 OpenList 的
            HTTP API 完成全部功能，不修改后端源码。
          </p>
        </div>
      </AdminSection>

      <AdminSection title="官方资源">
        <div className="flex flex-wrap gap-2 p-4">
          {LINKS.map((link) => (
            <Button key={link.url} variant="outline" size="sm" asChild>
              <a href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ))}
        </div>
      </AdminSection>

      <SectionNote>
        由于设置 <code className="mx-1 rounded bg-muted px-1">dist_dir</code>
        会同时替换官方管理页（OpenList 用同一份 index.html 渲染管理页），因此本管理后台为自建实现；
        未覆盖的能力（插件、消息、S3 等）请参考官方文档或直接编辑 config.json。
      </SectionNote>
    </div>
  )
}

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Image as ImageIcon, Loader2, RefreshCw, Send, Type } from "lucide-react"
import { toast } from "sonner"
import { adminApi, unwrap } from "@/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AdminEmpty, AdminError, AdminLoading, AdminRow, AdminSection, FormField, SectionNote } from "../ui"

/** 服务端 get 队列为空时返回的 code，属正常空态而非错误。 */
const NO_MESSAGE_CODE = 404

interface ReceivedMessage {
  id: number
  type: string
  content: unknown
}

const safeStringify = (value: unknown): string => {
  if (value == null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 将服务端未知的 data 收窄为 {type, content}，不合法时回退为文本。 */
const parseMessage = (raw: unknown, id: number): ReceivedMessage | null => {
  if (typeof raw === "string") return { id, type: "string", content: raw }
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const type = typeof obj.type === "string" && obj.type ? obj.type : "unknown"
  return { id, type, content: obj.content }
}

const typeLabel = (type: string): string => (type === "image" ? "图片" : type === "string" ? "文本" : type)

const SUPPORTED_TYPES: { type: string; label: string; hint: string; icon: React.ReactNode }[] = [
  { type: "string", label: "文本", hint: "content 为字符串，按纯文本展示", icon: <Type className="h-4 w-4" /> },
  { type: "image", label: "图片", hint: "content 为图片 URL，直接加载预览", icon: <ImageIcon className="h-4 w-4" /> },
]

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "flex min-h-[72px] w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-foreground",
        "placeholder:text-subtle/70 transition-colors duration-150 ease-ui",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}

function MessageContent({ message }: { message: ReceivedMessage }) {
  if (message.type === "image" && typeof message.content === "string" && message.content) {
    return (
      <img
        src={message.content}
        alt="消息图片"
        className="max-h-40 rounded-input border border-border bg-muted/40 object-contain"
      />
    )
  }
  const text = safeStringify(message.content)
  if (!text) return <span className="text-[13px] text-subtle">（空内容）</span>
  return <span className="block whitespace-pre-wrap break-words text-[13px]">{text}</span>
}

export function MessengerSection() {
  const [content, setContent] = useState("")
  const [received, setReceived] = useState<ReceivedMessage[]>([])
  const lastStamp = useRef(0)
  const seq = useRef(0)

  const stream = useQuery({
    queryKey: ["admin", "messenger", "stream"],
    queryFn: () => adminApi.messageGet(),
    retry: false,
    refetchInterval: 1500,
    refetchIntervalInBackground: false,
  })

  // get 是「弹出队列」语义：每次成功返回一条消息，追加到本地列表（最新在上）。
  useEffect(() => {
    const stamp = stream.dataUpdatedAt
    if (!stream.data || stamp === lastStamp.current) return
    lastStamp.current = stamp
    if (stream.data.code !== 200) return
    const parsed = parseMessage(stream.data.data, ++seq.current)
    if (parsed) setReceived((prev) => [parsed, ...prev])
  }, [stream.data, stream.dataUpdatedAt])

  const send = useMutation({
    mutationFn: async (message: string) => unwrap(await adminApi.messageSend(message)),
    onSuccess: () => {
      toast.success("消息已发送")
      setContent("")
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "发送失败"),
  })

  const streamError =
    stream.data && stream.data.code !== 200 && stream.data.code !== NO_MESSAGE_CODE ? stream.data.message : ""
  const sendError = send.isError ? (send.error instanceof Error ? send.error.message : "发送失败") : ""

  const submit = () => {
    const message = content.trim()
    if (!message) {
      toast.error("请填写消息内容")
      return
    }
    send.mutate(message)
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="收到的消息"
        description="服务端向网页推送的消息，每 1.5 秒自动接收一次"
        bodyClassName="p-0"
        actions={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void stream.refetch()}>
            <RefreshCw className={cn("h-4 w-4", stream.isFetching && "animate-spin")} />
            立即接收
          </Button>
        }
      >
        {stream.isLoading ? (
          <AdminLoading rows={2} />
        ) : streamError ? (
          <AdminError message={streamError} onRetry={() => void stream.refetch()} />
        ) : received.length === 0 ? (
          <AdminEmpty message="暂无收到的消息" />
        ) : (
          <div>
            {received.map((message) => (
              <AdminRow key={message.id} className="items-start">
                <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-subtle">
                  {typeLabel(message.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <MessageContent message={message} />
                </span>
              </AdminRow>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="发送消息"
        description="向服务端发送一条消息（请求体仅含 message 字段）"
      >
        <div className="space-y-3 p-4">
          <FormField
            label="消息内容"
            htmlFor="messenger-message"
            required
            help="对应官方 send 请求体的 message 字段"
          >
            <Textarea
              id="messenger-message"
              rows={4}
              value={content}
              placeholder="请输入要发送给服务端的内容"
              onChange={(e) => setContent(e.target.value)}
            />
          </FormField>

          {sendError && <AdminError message={sendError} />}

          <div className="flex justify-end">
            <Button variant="primary" className="gap-1.5" onClick={submit} disabled={send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </Button>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="支持的消息类型" bodyClassName="p-0">
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {SUPPORTED_TYPES.map((item) => (
              <div key={item.type} className="flex items-start gap-2 rounded-card border border-border bg-muted/40 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-subtle">{item.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {item.label}
                    <span className="ml-1.5 font-mono text-[11px] font-normal text-subtle">{item.type}</span>
                  </span>
                  <span className="block text-[11px] leading-relaxed text-subtle">{item.hint}</span>
                </span>
              </div>
            ))}
          </div>

          <SectionNote>
            该版本服务端仅提供 /api/admin/message/get 与 /api/admin/message/send：get 从服务端待发送队列弹出一条消息，
            返回 {"{type, content}"}，队列为空时返回 code 404「no message」，前端已按正常空态处理；send 的请求体仅含
            message 字段。官方接口未提供消息类型或发送通道的枚举列表，上表为按官方 Shower 注册表整理的类型说明，
            未知类型会以文本形式安全回退展示。
          </SectionNote>
        </div>
      </AdminSection>
    </div>
  )
}

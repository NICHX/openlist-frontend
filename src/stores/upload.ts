import { create } from "zustand"
import { joinPath } from "@/lib/path"
import { CancelledError, performUpload, type UploadStatus } from "@/features/upload/uploader"
import type { DroppedFile } from "@/features/upload/traverse"

export interface UploadTask {
  id: string
  file: File
  relPath: string
  destDir: string
  overwrite: boolean
  rapid: boolean
  status: UploadStatus
  progress: number
  speed: number
  size: number
  error?: string
}

interface EnqueueOptions {
  rapid?: boolean
  overwrite?: boolean
}

interface UploadState {
  tasks: UploadTask[]
  panelOpen: boolean
  /** Bumped whenever a task succeeds — the browser watches this to refresh. */
  completionTick: number
  setPanelOpen: (open: boolean) => void
  enqueue: (files: DroppedFile[], destDir: string, options?: EnqueueOptions) => void
  retry: (id: string) => void
  retryAllFailed: () => void
  cancel: (id: string) => void
  remove: (id: string) => void
  clearFinished: () => void
}

const MAX_CONCURRENT = 2
const controllers = new Map<string, AbortController>()
let running = 0

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const useUploadStore = create<UploadState>((set, get) => {
  const patch = (id: string, changes: Partial<UploadTask>) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }))

  const start = (task: UploadTask) => {
    running++
    const controller = new AbortController()
    controllers.set(task.id, controller)
    patch(task.id, { status: "uploading", progress: 0, speed: 0, error: undefined })

    const destPath = joinPath(task.destDir, task.relPath)

    performUpload(
      { file: task.file, destPath, overwrite: task.overwrite, rapid: task.rapid },
      {
        signal: controller.signal,
        onStatus: (status, error) => patch(task.id, { status, error }),
        onProgress: (progress) => patch(task.id, { progress }),
        onSpeed: (speed) => patch(task.id, { speed }),
      },
    )
      .then(() => {
        patch(task.id, { status: "success", progress: 100, speed: 0 })
        set((state) => ({ completionTick: state.completionTick + 1 }))
      })
      .catch((error: unknown) => {
        const cancelled = error instanceof CancelledError
        patch(task.id, {
          status: cancelled ? "canceled" : "error",
          speed: 0,
          error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        controllers.delete(task.id)
        running--
        pump()
      })
  }

  const pump = () => {
    const pending = get().tasks.filter((t) => t.status === "pending")
    for (const task of pending) {
      if (running >= MAX_CONCURRENT) break
      start(task)
    }
  }

  return {
    tasks: [],
    panelOpen: false,
    completionTick: 0,

    setPanelOpen: (panelOpen) => set({ panelOpen }),

    enqueue: (files, destDir, options = {}) => {
      if (files.length === 0) return
      const created: UploadTask[] = files.map(({ file, relPath }) => ({
        id: uid(),
        file,
        relPath,
        destDir,
        overwrite: options.overwrite ?? false,
        rapid: options.rapid ?? false,
        status: "pending",
        progress: 0,
        speed: 0,
        size: file.size,
      }))
      set((state) => ({ tasks: [...created, ...state.tasks], panelOpen: true }))
      pump()
    },

    retry: (id) => {
      patch(id, { status: "pending", progress: 0, speed: 0, error: undefined })
      pump()
    },

    retryAllFailed: () => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.status === "error" ? { ...t, status: "pending" as UploadStatus, progress: 0, error: undefined } : t,
        ),
      }))
      pump()
    },

    cancel: (id) => {
      controllers.get(id)?.abort()
      controllers.delete(id)
      const task = get().tasks.find((t) => t.id === id)
      if (task && task.status === "pending") patch(id, { status: "canceled" })
    },

    remove: (id) => {
      controllers.get(id)?.abort()
      controllers.delete(id)
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))
    },

    clearFinished: () =>
      set((state) => ({
        tasks: state.tasks.filter((t) => t.status !== "success" && t.status !== "canceled"),
      })),
  }
})

export const activeTaskCount = (tasks: UploadTask[]): number =>
  tasks.filter((t) => t.status === "uploading" || t.status === "hashing" || t.status === "backending" || t.status === "pending")
    .length

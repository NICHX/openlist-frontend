import { fsApi, multipartApi, type MultipartSnapshot } from "@/api"
import { canHash, fileHashes } from "@/lib/hash"

export type UploadStatus =
  | "pending"
  | "hashing"
  | "uploading"
  | "backending"
  | "success"
  | "error"
  | "canceled"

export interface UploadCallbacks {
  onStatus: (status: UploadStatus, error?: string) => void
  onProgress: (percent: number) => void
  onSpeed: (bytesPerSecond: number) => void
  signal: AbortSignal
}

export interface UploadTarget {
  file: File
  /** Full destination path including the file name (already joined). */
  destPath: string
  overwrite: boolean
  /** Compute hashes so the storage can skip the transfer when possible (秒传). */
  rapid: boolean
}

/** Files larger than this use the resumable multipart protocol. */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024
const CHUNK_SIZE = 10 * 1024 * 1024
/** Concurrent chunk requests; the server holds a small in-flight window. */
const INFLIGHT = 3
const MAX_CHUNK_RETRIES = 6

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class CancelledError extends Error {
  constructor() {
    super("已取消")
    this.name = "CancelledError"
  }
}

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new CancelledError()
}

/** Rolling bytes/sec sampler with a 500 ms window. */
class SpeedMeter {
  private lastTime = Date.now()
  private lastBytes = 0
  private peak = 0
  update(bytes: number, onSpeed: (bps: number) => void) {
    this.peak = Math.max(this.peak, bytes)
    const now = Date.now()
    const dt = now - this.lastTime
    if (dt >= 500) {
      onSpeed(((this.peak - this.lastBytes) / dt) * 1000)
      this.lastTime = now
      this.lastBytes = this.peak
    }
  }
}

/**
 * Upload a single file. Prefers the resumable multipart protocol for large
 * files and transparently falls back to a streaming PUT when the storage or
 * backend does not support sessions.
 */
export async function performUpload(target: UploadTarget, cb: UploadCallbacks): Promise<void> {
  const { file, destPath, overwrite, rapid } = target
  throwIfAborted(cb.signal)

  let hashes: { md5?: string; sha1?: string; sha256?: string } | undefined
  if (rapid && canHash(file)) {
    cb.onStatus("hashing")
    try {
      hashes = await fileHashes(file, (p) => cb.onProgress(Math.round(p * 0.2)), cb.signal)
    } catch (e) {
      if (e instanceof Error && e.message === "aborted") throw new CancelledError()
      // Hashing is best-effort; continue without rapid upload.
      hashes = undefined
    }
    cb.onProgress(0)
  }

  const useMultipart = file.size > MULTIPART_THRESHOLD
  if (useMultipart) {
    const done = await tryMultipart(file, destPath, overwrite, hashes, cb)
    if (done) {
      cb.onProgress(100)
      cb.onStatus("success")
      return
    }
  }

  await streamUpload(file, destPath, overwrite, hashes, cb)
  cb.onProgress(100)
  cb.onStatus("success")
}

type Hashes = { md5?: string; sha1?: string; sha256?: string } | undefined

/** Streaming PUT (/api/fs/put). Single request with live progress. */
async function streamUpload(
  file: File,
  destPath: string,
  overwrite: boolean,
  hashes: Hashes,
  cb: UploadCallbacks,
): Promise<void> {
  cb.onStatus("uploading")
  const meter = new SpeedMeter()
  let wasBackending = false
  const resp = await fsApi.put(file, destPath, {
    overwrite,
    hashes,
    signal: cb.signal,
    lastModified: file.lastModified,
    onProgress: (loaded, total) => {
      cb.onProgress(total ? Math.round((loaded / total) * 100) : 0)
      meter.update(loaded, cb.onSpeed)
      if (!wasBackending && loaded >= total) {
        wasBackending = true
        cb.onStatus("backending")
      }
    },
  })
  if (resp.code !== 200) {
    if (cb.signal.aborted) throw new CancelledError()
    throw new Error(resp.message || "上传失败")
  }
}

/**
 * Resumable multipart upload (/api/fs/multipart/*). Returns `false` when the
 * backend/storage does not support sessions so the caller can fall back.
 */
async function tryMultipart(
  file: File,
  destPath: string,
  overwrite: boolean,
  hashes: { md5?: string; sha1?: string; sha256?: string } | undefined,
  cb: UploadCallbacks,
): Promise<boolean> {
  throwIfAborted(cb.signal)

  const initResp = await multipartApi.init(destPath, file, CHUNK_SIZE, { overwrite, hashes })
  if (initResp.code !== 200) {
    // A hard rejection for a small-ish file usually means the route is absent
    // (older backend) — fall back to streaming rather than failing.
    return false
  }
  const session = initResp.data
  if (!session || !session.upload_id) {
    // Backend explicitly reports no session support (`data: null`).
    return false
  }
  if (session.state === "completed") {
    // Rapid upload short-circuit: the storage already had the content.
    cb.onProgress(100)
    return true
  }

  cb.onStatus("uploading")

  const { upload_id, chunk_size, total_chunks } = session
  const chunkSize = chunk_size || CHUNK_SIZE
  const total = total_chunks || Math.ceil(file.size / chunkSize)
  const chunkLen = (i: number) => (i === total - 1 ? file.size - i * chunkSize : chunkSize)

  // Which chunks does the server already have? (resume support)
  const have = new Set<number>()
  for (const [lo, hi] of session.received ?? []) {
    for (let i = lo; i <= hi; i++) have.add(i)
  }
  const missing: number[] = []
  for (let i = 0; i < total; i++) if (!have.has(i)) missing.push(i)

  let acked = session.received_bytes ?? 0
  const inflight: Record<number, number> = {}
  const inflightSum = () => Object.values(inflight).reduce((a, b) => a + b, 0)
  const meter = new SpeedMeter()
  const report = () => {
    const done = Math.min(acked + inflightSum(), file.size)
    cb.onProgress(file.size ? Math.round((done / file.size) * 100) : 0)
    meter.update(done, cb.onSpeed)
  }
  report()

  let completedEarly = false
  let fatal: Error | undefined

  const sendChunk = async (index: number) => {
    const blob = file.slice(index * chunkSize, index * chunkSize + chunkLen(index))
    for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      throwIfAborted(cb.signal)
      if (completedEarly || fatal) return
      const resp = await multipartApi.chunk(
        blob,
        upload_id,
        index,
        (loaded) => {
          inflight[index] = loaded
          report()
        },
        cb.signal,
      )
      delete inflight[index]

      if (resp.code === 200) {
        acked += chunkLen(index)
        if (resp.data?.state === "completed") completedEarly = true
        report()
        return
      }

      // Flow control (429) / conflict (409) / transport error (-1 or status):
      // retry with linear backoff instead of failing the whole upload.
      const retriable = resp.code === 429 || resp.code === 409 || resp.code < 0 || resp.code >= 500
      if (!retriable || attempt === MAX_CHUNK_RETRIES) {
        // Probe the session: a rapid upload may have completed concurrently.
        const status = await multipartApi.status(upload_id).catch(() => undefined)
        if (status?.code === 200 && status.data.state === "completed") {
          completedEarly = true
          return
        }
        if (status?.code === 404) {
          completedEarly = true
          return
        }
        if (retriable && attempt === MAX_CHUNK_RETRIES) {
          throw new Error(`分片 ${index + 1}/${total} 重试多次仍失败`)
        }
        throw new Error(resp.message || `分片 ${index + 1}/${total} 上传失败`)
      }
      await sleep(Math.min(800 * (attempt + 1), 4000))
    }
  }

  let next = 0
  const worker = async () => {
    for (;;) {
      if (completedEarly || fatal) return
      const slot = next++
      if (slot >= missing.length) return
      try {
        await sendChunk(missing[slot])
      } catch (e) {
        fatal = e instanceof Error ? e : new Error(String(e))
        return
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(INFLIGHT, missing.length) || 1 }, worker))
  if (fatal) throw fatal
  if (completedEarly) {
    cb.onProgress(100)
    return true
  }

  // All bytes are on the server; the driver may still be writing to storage.
  cb.onStatus("backending")
  cb.onSpeed(0)
  await finishMultipart(upload_id, cb)
  return true
}

/** Complete the session, polling status while the storage flushes. */
async function finishMultipart(uploadId: string, cb: UploadCallbacks): Promise<void> {
  const complete = multipartApi.complete(uploadId).catch(() => undefined)
  let settled = false
  void complete.finally(() => {
    settled = true
  })

  while (!settled) {
    await sleep(1500)
    if (settled) break
    const status = await multipartApi.status(uploadId).catch(() => undefined)
    if (status?.code === 200 && status.data.state === "receiving") {
      cb.onProgress(Math.max(0, Math.min(100, status.data.storage_progress | 0)))
    }
  }

  const fin = await complete
  if (fin && fin.code === 200) {
    cb.onProgress(100)
    return
  }

  // The complete call was cut off — poll the session to its terminal state.
  for (let i = 0; i < 150; i++) {
    await sleep(2000)
    const status = await multipartApi.status(uploadId).catch(() => undefined)
    if (!status) continue
    if (status.code === 404) return // reaped after success
    if (status.code !== 200) throw new Error(status.message)
    const snapshot: MultipartSnapshot = status.data
    if (snapshot.state === "completed") {
      cb.onProgress(100)
      return
    }
    if (snapshot.state === "receiving") {
      cb.onProgress(Math.max(0, Math.min(100, snapshot.storage_progress | 0)))
      continue
    }
    throw new Error(snapshot.error || `上传失败 (${snapshot.state})`)
  }
  throw new Error("上传超时")
}

export { CancelledError }

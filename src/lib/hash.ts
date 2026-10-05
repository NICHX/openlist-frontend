/**
 * Hashing helpers.
 * - `sha256Hex` powers the `/auth/login/hash` variant.
 * - `fileHashes` powers rapid upload (秒传): MD5 + SHA-1 + SHA-256 of the file,
 *   sent as `X-File-*` headers so the storage can skip the transfer.
 *
 * SHA-1/SHA-256 come from WebCrypto (native, fast). MD5 is not in WebCrypto, so
 * a compact implementation is included below.
 */

const K: number[] = (() => {
  const arr = new Array<number>(64)
  for (let i = 0; i < 64; i++) arr[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
  return arr
})()

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const rotl = (x: number, c: number): number => (x << c) | (x >>> (32 - c))

/** MD5 of a byte array → lowercase hex digest. */
export function md5(input: Uint8Array): string {
  const originalLen = input.length
  // Padded length: message + 0x80 + zeros + 8-byte length, multiple of 64.
  const withOne = originalLen + 1
  const padLen = ((56 - (withOne % 64)) + 64) % 64
  const totalLen = withOne + padLen + 8
  const bytes = new Uint8Array(totalLen)
  bytes.set(input)
  bytes[originalLen] = 0x80
  const bitLen = originalLen * 8
  // Little-endian 64-bit length.
  const dv = new DataView(bytes.buffer)
  dv.setUint32(totalLen - 8, bitLen >>> 0, true)
  dv.setUint32(totalLen - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const m = new Array<number>(16)
  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = dv.getUint32(off + i * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + m[g]) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(f, S[i])) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, a0 >>> 0, true)
  ov.setUint32(4, b0 >>> 0, true)
  ov.setUint32(8, c0 >>> 0, true)
  ov.setUint32(12, d0 >>> 0, true)
  return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("")
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("")

/** SHA-256 hex of a UTF-8 string (used for `/auth/login/hash`). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return toHex(digest)
}

export interface FileHashes {
  md5: string
  sha1: string
  sha256: string
}

/** Files above this size are not hashed in the browser (memory guard). */
const MAX_HASH_BYTES = 512 * 1024 * 1024

export const canHash = (file: File): boolean => file.size <= MAX_HASH_BYTES

/**
 * Compute MD5 + SHA-1 + SHA-256 for rapid upload. `onProgress` reports 0–100.
 * Throws for files above `MAX_HASH_BYTES`; callers treat hashing as best-effort.
 */
export async function fileHashes(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<FileHashes> {
  if (!canHash(file)) throw new Error("file too large to hash in the browser")

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 60))
    }
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.onabort = () => reject(new Error("aborted"))
    reader.readAsArrayBuffer(file)
  })

  if (signal?.aborted) throw new Error("aborted")
  const bytes = new Uint8Array(buffer)
  onProgress?.(70)
  const md5Hex = md5(bytes)
  if (signal?.aborted) throw new Error("aborted")
  onProgress?.(85)
  const [sha1, sha256] = await Promise.all([
    crypto.subtle.digest("SHA-1", buffer).then(toHex),
    crypto.subtle.digest("SHA-256", buffer).then(toHex),
  ])
  onProgress?.(100)
  return { md5: md5Hex, sha1, sha256 }
}

export interface DroppedFile {
  file: File
  /** Path relative to the drop root; includes sub-folders for folder drops. */
  relPath: string
}

const readEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => reader.readEntries(resolve, reject))

const readFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject))

const walk = async (entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> => {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry)
    out.push({ file, relPath: prefix + file.name })
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const next = `${prefix}${entry.name}/`
    // readEntries returns at most ~100 entries per call, so keep reading until
    // it yields an empty batch (per the FileSystem API spec).
    for (;;) {
      const batch = await readEntries(reader)
      if (batch.length === 0) break
      for (const child of batch) await walk(child, next, out)
    }
  }
}

/**
 * Extract files from a drag-and-drop, preserving folder structure so a dropped
 * folder uploads as a folder tree (not flattened).
 */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items ?? [])
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => Boolean(e))

  if (entries.length > 0) {
    const out: DroppedFile[] = []
    for (const entry of entries) await walk(entry, "", out)
    if (out.length > 0) return out
  }

  // Fallback for browsers/environments without the entries API.
  return Array.from(dataTransfer.files ?? []).map((file) => ({ file, relPath: file.name }))
}

/** Map a `<input type="file" webkitdirectory>` selection to relative paths. */
export function filesFromInput(fileList: FileList): DroppedFile[] {
  return Array.from(fileList).map((file) => {
    const withDir = file as File & { webkitRelativePath?: string }
    return { file, relPath: withDir.webkitRelativePath || file.name }
  })
}

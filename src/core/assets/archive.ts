import { unzipSync } from 'fflate'
import type { VirtualFile } from '../types'
import { classifyFile, isIgnoredPath } from './fileClassifier'
import { createVirtualFile } from './virtualFile'

export const ARCHIVE_LIMITS = {
  maxEntries: 4096,
  maxTotalBytes: 512 * 1024 * 1024,
  maxDepth: 2,
} as const

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveError'
  }
}

function extractArchive(archive: VirtualFile, depth: number, budget: { bytes: number; entries: number }): VirtualFile[] {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(archive.bytes, {
      filter: (info) => {
        if (info.name.endsWith('/') || isIgnoredPath(info.name)) return false
        budget.entries += 1
        budget.bytes += info.originalSize
        if (budget.entries > ARCHIVE_LIMITS.maxEntries) throw new ArchiveError(`壓縮檔項目數超過上限 ${ARCHIVE_LIMITS.maxEntries}`)
        if (budget.bytes > ARCHIVE_LIMITS.maxTotalBytes) throw new ArchiveError('壓縮檔解壓後容量超過 512 MB 上限')
        return true
      },
    })
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    throw new ArchiveError(`無法解壓縮 ${archive.name}：${error instanceof Error ? error.message : String(error)}`)
  }
  const prefix = archive.path.slice(0, archive.path.length - archive.extension.length)
  const result: VirtualFile[] = []
  for (const [path, bytes] of Object.entries(entries)) {
    const file = createVirtualFile(`${prefix}/${path}`, bytes)
    if (classifyFile(file) === 'archive') {
      if (depth + 1 < ARCHIVE_LIMITS.maxDepth) result.push(...extractArchive(file, depth + 1, budget))
      continue
    }
    result.push(file)
  }
  return result
}

export function expandArchives(files: readonly VirtualFile[]): VirtualFile[] {
  const budget = { bytes: 0, entries: 0 }
  const result: VirtualFile[] = []
  for (const file of files) {
    if (isIgnoredPath(file.path)) continue
    if (classifyFile(file) === 'archive') result.push(...extractArchive(file, 0, budget))
    else result.push(file)
  }
  return result
}

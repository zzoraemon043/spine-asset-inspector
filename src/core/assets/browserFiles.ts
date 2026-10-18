import type { AssetSource, TexturePixels, VirtualFile } from '../types'
import { expandArchives } from './archive'
import { resolveBundle } from './bundleResolver'
import { createVirtualFile, readText } from './virtualFile'

export const MAX_INPUT_BYTES = 512 * 1024 * 1024

export class AssetLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetLoadError'
  }
}

function relativePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relative && relative.length > 0 ? relative : file.name
}

export async function readFiles(files: readonly File[], paths?: readonly string[]): Promise<VirtualFile[]> {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > MAX_INPUT_BYTES) throw new AssetLoadError('輸入檔案總容量超過 512 MB 上限')
  return Promise.all(
    files.map(async (file, index) => createVirtualFile(paths?.[index] ?? relativePath(file), new Uint8Array(await file.arrayBuffer()))),
  )
}

type Entry = FileSystemEntry

function isFileEntry(entry: Entry): entry is FileSystemFileEntry {
  return entry.isFile
}

function isDirectoryEntry(entry: Entry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readDirectory(entry: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = entry.createReader()
  const result: Entry[] = []
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) return result
    result.push(...batch)
  }
}

async function walk(entry: Entry, files: File[], paths: string[], depth: number): Promise<void> {
  if (depth > 8) return
  if (isFileEntry(entry)) {
    files.push(await entryFile(entry))
    paths.push(entry.fullPath.replace(/^\//, ''))
  } else if (isDirectoryEntry(entry)) {
    for (const child of await readDirectory(entry)) await walk(child, files, paths, depth + 1)
  }
}

export async function collectDropped(dataTransfer: DataTransfer): Promise<VirtualFile[]> {
  const entries: Entry[] = []
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) entries.push(entry)
  }
  if (entries.length === 0 || entries.every(isFileEntry)) return readFiles(Array.from(dataTransfer.files))
  const files: File[] = []
  const paths: string[] = []
  for (const entry of entries) await walk(entry, files, paths, 0)
  return readFiles(files, paths)
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
}

export async function decodeTexture(file: VirtualFile): Promise<ImageBitmap> {
  const blob = new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: MIME_BY_EXTENSION[file.extension] ?? 'application/octet-stream' })
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  } catch {
    throw new AssetLoadError(`貼圖解碼失敗：${file.path}`)
  }
}

export function pixelsToBitmap(texture: TexturePixels): Promise<ImageBitmap> {
  const data = new ImageData(new Uint8ClampedArray(texture.pixels), texture.width, texture.height)
  return createImageBitmap(data, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
}

export async function buildLocalSource(input: readonly VirtualFile[], preferredSkeleton?: string): Promise<AssetSource<ImageBitmap>> {
  const files = expandArchives(input)
  const result = resolveBundle(files, preferredSkeleton)
  if (!result.ok) throw new AssetLoadError(result.error)
  const { bundle } = result
  const pages = new Map<string, ImageBitmap>()
  for (const [page, file] of bundle.textures) pages.set(page, await decodeTexture(file))
  return {
    name: bundle.skeleton.baseName,
    origin: 'local',
    skeleton: {
      fileName: bundle.skeleton.path,
      format: bundle.format,
      data: bundle.format === 'json' ? readText(bundle.skeleton) : bundle.skeleton.bytes,
    },
    atlasText: readText(bundle.atlas),
    pages,
    skeletonCandidates: bundle.skeletonCandidates,
    warnings: bundle.warnings,
  }
}

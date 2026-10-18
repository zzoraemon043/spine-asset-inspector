import type { VirtualFile } from '../types'

const COMPOUND_EXTENSIONS = ['.skel.bytes', '.atlas.txt', '.json.txt']

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/')
}

export function splitFileName(path: string): { name: string; baseName: string; extension: string } {
  const normalized = normalizePath(path)
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  const lower = name.toLowerCase()
  const compound = COMPOUND_EXTENSIONS.find((ext) => lower.endsWith(ext))
  if (compound) {
    return { name, baseName: name.slice(0, name.length - compound.length), extension: compound }
  }
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { name, baseName: name, extension: '' }
  return { name, baseName: name.slice(0, dot), extension: lower.slice(dot) }
}

export function createVirtualFile(path: string, bytes: Uint8Array): VirtualFile {
  const normalized = normalizePath(path)
  const { name, baseName, extension } = splitFileName(normalized)
  return { path: normalized, name, baseName, extension, bytes }
}

const decoder = new TextDecoder('utf-8')

export function readText(file: VirtualFile): string {
  const text = decoder.decode(file.bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

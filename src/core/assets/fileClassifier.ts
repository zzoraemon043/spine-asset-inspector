import type { FileRole, VirtualFile } from '../types'
import { readText } from './virtualFile'

const TEXTURE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.avif'])
const ARCHIVE_EXTENSIONS = new Set(['.zip'])
const ATLAS_EXTENSIONS = new Set(['.atlas', '.atlas.txt'])
const BINARY_EXTENSIONS = new Set(['.skel', '.skel.bytes'])
const JSON_EXTENSIONS = new Set(['.json', '.json.txt'])
export const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.aac', '.flac'])

export function looksLikeSkeletonJson(text: string): boolean {
  const head = text.slice(0, 4096)
  return /"skeleton"\s*:/.test(head) || (/"bones"\s*:/.test(text) && /"slots"\s*:|"animations"\s*:/.test(text))
}

export function classifyFile(file: VirtualFile): FileRole {
  const ext = file.extension
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (TEXTURE_EXTENSIONS.has(ext)) return 'texture'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ATLAS_EXTENSIONS.has(ext)) return 'atlas'
  if (BINARY_EXTENSIONS.has(ext)) return 'skeleton-binary'
  if (JSON_EXTENSIONS.has(ext)) return looksLikeSkeletonJson(readText(file)) ? 'skeleton-json' : 'unknown'
  return 'unknown'
}

export function isIgnoredPath(path: string): boolean {
  const segments = path.split('/')
  return segments.some((segment) => segment === '__MACOSX' || segment.startsWith('._') || segment === '.DS_Store')
}

export function isAudioFile(file: VirtualFile): boolean {
  return AUDIO_EXTENSIONS.has(file.extension)
}

export function isTextureFile(file: VirtualFile): boolean {
  return TEXTURE_EXTENSIONS.has(file.extension)
}

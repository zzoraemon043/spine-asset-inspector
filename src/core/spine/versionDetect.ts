import type { SkeletonFormat, SpineVersionInfo } from '../types'

export const RUNTIME_VERSION = { major: 4, minor: 2 } as const

export function parseVersion(raw: string | null): SpineVersionInfo {
  if (!raw) return { raw: null, major: null, minor: null, compatible: false }
  const match = /^(\d+)\.(\d+)/.exec(raw.trim())
  if (!match) return { raw, major: null, minor: null, compatible: false }
  const major = Number(match[1])
  const minor = Number(match[2])
  return { raw, major, minor, compatible: major === RUNTIME_VERSION.major && minor === RUNTIME_VERSION.minor }
}

function readVarInt(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0
  let shift = 0
  let index = offset
  while (index < bytes.length && shift <= 28) {
    const byte = bytes[index]
    value |= (byte & 0x7f) << shift
    index += 1
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: index }
    shift += 7
  }
  return null
}

function readBinaryString(bytes: Uint8Array, offset: number): { value: string | null; next: number } | null {
  const length = readVarInt(bytes, offset)
  if (!length) return null
  if (length.value === 0) return { value: null, next: length.next }
  const size = length.value - 1
  if (length.next + size > bytes.length || size > 64) return null
  const value = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(length.next, length.next + size))
  return { value, next: length.next + size }
}

const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?/

export function detectBinaryVersion(bytes: Uint8Array): string | null {
  const modern = readBinaryString(bytes, 8)
  if (modern?.value && VERSION_PATTERN.test(modern.value)) return modern.value
  const legacyHash = readBinaryString(bytes, 0)
  if (legacyHash) {
    const legacy = readBinaryString(bytes, legacyHash.next)
    if (legacy?.value && VERSION_PATTERN.test(legacy.value)) return legacy.value
  }
  return null
}

export function detectJsonVersion(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const skeleton = (json as { skeleton?: unknown }).skeleton
  if (typeof skeleton !== 'object' || skeleton === null) return null
  const spine = (skeleton as { spine?: unknown }).spine
  return typeof spine === 'string' ? spine : null
}

export function detectVersion(format: SkeletonFormat, data: string | Uint8Array): SpineVersionInfo {
  if (format === 'binary') {
    return parseVersion(typeof data === 'string' ? null : detectBinaryVersion(data))
  }
  try {
    const parsed: unknown = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data))
    return parseVersion(detectJsonVersion(parsed))
  } catch {
    return parseVersion(null)
  }
}

import { zipSync } from 'fflate'
import type { TexturePixels } from '../types'
import { encodePng } from '../image/pngEncode'
import { serializeDocument } from './serialize'
import type { SkeletonDocument } from './document'

export interface ProjectArchiveInput {
  readonly stem: string
  readonly document: SkeletonDocument
  readonly atlasText: string
  readonly pages: ReadonlyMap<string, TexturePixels>
}

export interface ProjectArchive {
  readonly zip: Uint8Array
  readonly files: readonly string[]
}

function safeEntry(name: string): string {
  return name.replace(/\\/g, '/').split('/').filter((part) => part !== '' && part !== '.' && part !== '..').join('/') || 'page.png'
}

export function buildProjectArchive(input: ProjectArchiveInput): ProjectArchive {
  const encoder = new TextEncoder()
  const entries: Record<string, Uint8Array> = {
    [`${input.stem}.json`]: encoder.encode(serializeDocument(input.document)),
    [`${input.stem}.atlas`]: encoder.encode(input.atlasText),
  }
  for (const [name, pixels] of input.pages) entries[safeEntry(name)] = encodePng(pixels)
  return { zip: zipSync(entries, { level: 6 }), files: Object.keys(entries) }
}

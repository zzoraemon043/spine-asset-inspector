import type { ResolvedBundle, SkeletonFormat, VirtualFile } from '../types'
import { inspectAtlas } from './atlasPages'
import { classifyFile } from './fileClassifier'
import { readText, splitFileName } from './virtualFile'

export type BundleResult = { readonly ok: true; readonly bundle: ResolvedBundle } | { readonly ok: false; readonly error: string }

function directoryOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function byPath(a: VirtualFile, b: VirtualFile): number {
  return a.path.localeCompare(b.path)
}

function pickAtlas(skeleton: VirtualFile, atlases: readonly VirtualFile[]): VirtualFile | undefined {
  const dir = directoryOf(skeleton.path)
  const base = skeleton.baseName.toLowerCase()
  return (
    atlases.find((atlas) => directoryOf(atlas.path) === dir && atlas.baseName.toLowerCase() === base) ??
    atlases.find((atlas) => atlas.baseName.toLowerCase() === base) ??
    atlases.find((atlas) => directoryOf(atlas.path) === dir) ??
    atlases[0]
  )
}

function matchTexture(pageName: string, atlas: VirtualFile, textures: readonly VirtualFile[]): VirtualFile | undefined {
  const dir = directoryOf(atlas.path)
  const wantedPath = (dir ? `${dir}/${pageName}` : pageName).toLowerCase()
  const wantedName = splitFileName(pageName).name.toLowerCase()
  const wantedBase = splitFileName(pageName).baseName.toLowerCase()
  return (
    textures.find((texture) => texture.path.toLowerCase() === wantedPath) ??
    textures.find((texture) => texture.name.toLowerCase() === wantedName) ??
    textures.find((texture) => texture.baseName.toLowerCase() === wantedBase)
  )
}

export function resolveBundle(files: readonly VirtualFile[], preferredSkeleton?: string): BundleResult {
  const skeletons: Array<{ file: VirtualFile; format: SkeletonFormat }> = []
  const atlases: VirtualFile[] = []
  const textures: VirtualFile[] = []
  const warnings: string[] = []
  for (const file of [...files].sort(byPath)) {
    const role = classifyFile(file)
    if (role === 'skeleton-json') skeletons.push({ file, format: 'json' })
    else if (role === 'skeleton-binary') skeletons.push({ file, format: 'binary' })
    else if (role === 'atlas') atlases.push(file)
    else if (role === 'texture') textures.push(file)
    else if (role === 'unknown') warnings.push(`已略過無法辨識的檔案：${file.path}`)
  }
  if (skeletons.length === 0) return { ok: false, error: '找不到骨架檔（.json 或 .skel）' }
  if (atlases.length === 0) return { ok: false, error: '找不到圖集描述檔（.atlas）' }
  if (textures.length === 0) return { ok: false, error: '找不到貼圖檔（.png）' }
  const chosen = skeletons.find((entry) => entry.file.path === preferredSkeleton) ?? skeletons[0]
  if (skeletons.length > 1) warnings.push(`偵測到 ${skeletons.length} 個骨架檔，目前載入 ${chosen.file.path}`)
  const atlas = pickAtlas(chosen.file, atlases)
  if (!atlas) return { ok: false, error: '找不到與骨架對應的圖集描述檔' }
  let pages: readonly string[]
  try {
    pages = inspectAtlas(readText(atlas)).pages
  } catch (error) {
    return { ok: false, error: `圖集解析失敗：${error instanceof Error ? error.message : String(error)}` }
  }
  const textureMap = new Map<string, VirtualFile>()
  const missing: string[] = []
  for (const page of pages) {
    const texture = matchTexture(page, atlas, textures)
    if (texture) textureMap.set(page, texture)
    else missing.push(page)
  }
  if (missing.length > 0) return { ok: false, error: `缺少圖集頁面貼圖：${missing.join(', ')}` }
  return {
    ok: true,
    bundle: {
      skeleton: chosen.file,
      format: chosen.format,
      atlas,
      textures: textureMap,
      skeletonCandidates: skeletons.map((entry) => entry.file.path),
      warnings,
    },
  }
}

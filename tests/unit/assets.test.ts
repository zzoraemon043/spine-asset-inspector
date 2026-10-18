import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { createVirtualFile, normalizePath, readText, splitFileName } from '../../src/core/assets/virtualFile'
import { classifyFile, isIgnoredPath, looksLikeSkeletonJson } from '../../src/core/assets/fileClassifier'
import { ARCHIVE_LIMITS, ArchiveError, expandArchives } from '../../src/core/assets/archive'
import { resolveBundle } from '../../src/core/assets/bundleResolver'
import { inspectAtlas } from '../../src/core/assets/atlasPages'
import { demoFileSet, demoVirtualFiles } from '../support/demoFiles'

const encode = (text: string) => new TextEncoder().encode(text)

describe('virtual file helpers', () => {
  it('normalizes separators and leading dot segments', () => {
    expect(normalizePath('.\\hero\\\\hero.json')).toBe('hero/hero.json')
  })

  it('splits compound extensions', () => {
    expect(splitFileName('a/hero.skel.bytes')).toEqual({ name: 'hero.skel.bytes', baseName: 'hero', extension: '.skel.bytes' })
    expect(splitFileName('hero.atlas.txt').extension).toBe('.atlas.txt')
    expect(splitFileName('HERO.PNG')).toEqual({ name: 'HERO.PNG', baseName: 'HERO', extension: '.png' })
    expect(splitFileName('README').extension).toBe('')
  })

  it('strips a UTF-8 byte order mark', () => {
    const file = createVirtualFile('a.atlas', new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))
    expect(readText(file)).toBe('a')
  })
})

describe('file classification', () => {
  it('detects every supported role', () => {
    expect(classifyFile(createVirtualFile('a.skel', new Uint8Array(4)))).toBe('skeleton-binary')
    expect(classifyFile(createVirtualFile('a.skel.bytes', new Uint8Array(4)))).toBe('skeleton-binary')
    expect(classifyFile(createVirtualFile('a.atlas', encode('page.png')))).toBe('atlas')
    expect(classifyFile(createVirtualFile('a.png', new Uint8Array(4)))).toBe('texture')
    expect(classifyFile(createVirtualFile('a.zip', new Uint8Array(4)))).toBe('archive')
    expect(classifyFile(createVirtualFile('a.json', encode('{"skeleton":{"spine":"4.2.0"},"bones":[]}')))).toBe('skeleton-json')
    expect(classifyFile(createVirtualFile('package.json', encode('{"name":"x"}')))).toBe('unknown')
    expect(classifyFile(createVirtualFile('notes.md', encode('x')))).toBe('unknown')
  })

  it('recognises skeleton json without a skeleton header', () => {
    expect(looksLikeSkeletonJson('{"bones":[{"name":"root"}],"slots":[]}')).toBe(true)
    expect(looksLikeSkeletonJson('{"frames":{}}')).toBe(false)
  })

  it('ignores operating system metadata paths', () => {
    expect(isIgnoredPath('__MACOSX/hero.png')).toBe(true)
    expect(isIgnoredPath('pack/._hero.png')).toBe(true)
    expect(isIgnoredPath('pack/hero.png')).toBe(false)
  })
})

describe('archive expansion', () => {
  it('expands zip archives and drops metadata entries', () => {
    const set = demoFileSet()
    const zip = zipSync({
      'hero/inspector-demo.json': set.json,
      'hero/inspector-demo.atlas': set.atlas,
      'hero/inspector-demo.png': set.png,
      '__MACOSX/hero/._inspector-demo.png': new Uint8Array(3),
    })
    const files = expandArchives([createVirtualFile('pack.zip', zip)])
    expect(files.map((file) => file.path).sort()).toEqual(['pack/hero/inspector-demo.atlas', 'pack/hero/inspector-demo.json', 'pack/hero/inspector-demo.png'])
  })

  it('expands nested archives up to the depth limit', () => {
    const inner = zipSync({ 'a.atlas': encode('page.png\n') })
    const outer = zipSync({ 'inner.zip': inner })
    const files = expandArchives([createVirtualFile('outer.zip', outer)])
    expect(files.map((file) => file.path)).toEqual(['outer/inner/a.atlas'])
  })

  it('rejects archives above the entry budget', () => {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i <= ARCHIVE_LIMITS.maxEntries; i++) entries[`f${i}.txt`] = new Uint8Array(0)
    expect(() => expandArchives([createVirtualFile('bomb.zip', zipSync(entries))])).toThrow(ArchiveError)
  })

  it('reports corrupt archives', () => {
    expect(() => expandArchives([createVirtualFile('broken.zip', encode('not a zip'))])).toThrow(ArchiveError)
  })
})

describe('bundle resolution', () => {
  it('resolves skeleton, atlas and page textures', () => {
    const result = resolveBundle(demoVirtualFiles('pack/'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bundle.format).toBe('json')
    expect(result.bundle.skeleton.path).toBe('pack/inspector-demo.json')
    expect([...result.bundle.textures.keys()]).toEqual(['inspector-demo.png'])
  })

  it('matches textures case-insensitively across folders', () => {
    const set = demoFileSet()
    const files = [
      createVirtualFile('export/inspector-demo.json', set.json),
      createVirtualFile('export/inspector-demo.atlas', set.atlas),
      createVirtualFile('images/INSPECTOR-DEMO.PNG', set.png),
    ]
    const result = resolveBundle(files)
    expect(result.ok).toBe(true)
  })

  it('reports missing pieces', () => {
    const [json, atlas, png] = demoVirtualFiles()
    expect(resolveBundle([atlas, png])).toEqual({ ok: false, error: '找不到骨架檔（.json 或 .skel）' })
    expect(resolveBundle([json, png])).toEqual({ ok: false, error: '找不到圖集描述檔（.atlas）' })
    expect(resolveBundle([json, atlas])).toEqual({ ok: false, error: '找不到貼圖檔（.png）' })
    const wrong = createVirtualFile('other.png', new Uint8Array(4))
    const missing = resolveBundle([json, atlas, wrong])
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain('inspector-demo.png')
  })

  it('lists candidates and honours the preferred skeleton', () => {
    const set = demoFileSet()
    const files = [
      createVirtualFile('a/hero.json', set.json),
      createVirtualFile('b/villain.json', set.json),
      createVirtualFile('a/hero.atlas', set.atlas),
      createVirtualFile('a/inspector-demo.png', set.png),
    ]
    const first = resolveBundle(files)
    expect(first.ok && first.bundle.skeletonCandidates).toEqual(['a/hero.json', 'b/villain.json'])
    expect(first.ok && first.bundle.warnings.some((warning) => warning.includes('2 個骨架檔'))).toBe(true)
    const preferred = resolveBundle(files, 'b/villain.json')
    expect(preferred.ok && preferred.bundle.skeleton.path).toBe('b/villain.json')
  })

  it('pairs the atlas sharing the skeleton base name', () => {
    const set = demoFileSet()
    const files = [
      createVirtualFile('hero.skel', new Uint8Array(16)),
      createVirtualFile('aaa.atlas', encode('missing.png\nsize:4,4\n')),
      createVirtualFile('hero.atlas', set.atlas),
      createVirtualFile('inspector-demo.png', set.png),
    ]
    const result = resolveBundle(files)
    expect(result.ok && result.bundle.atlas.path).toBe('hero.atlas')
    expect(result.ok && result.bundle.format).toBe('binary')
  })

  it('reads atlas overview', () => {
    const overview = inspectAtlas(new TextDecoder().decode(demoFileSet().atlas))
    expect(overview.pages).toEqual(['inspector-demo.png'])
    expect(overview.regions).toBe(20)
    expect(overview.premultipliedAlpha).toBe(false)
  })
})

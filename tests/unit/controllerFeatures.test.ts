import { beforeEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { createVirtualFile } from '../../src/core/assets/virtualFile'
import { classifyFile, isAudioFile, isTextureFile } from '../../src/core/assets/fileClassifier'
import { encodePng } from '../../src/core/image/pngEncode'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { decodePng } from '../support/pngDecode'
import { encodeWav, synthesizeClicks } from '../support/wav'

let harness: FakeHarness
const state = () => useInspectorStore.getState()

function solidPng(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) pixels.set([255, 0, 255, 255], i * 4)
  return createVirtualFile('magenta.png', encodePng({ width, height, pixels }))
}

function clickWav(name: string, clicks: number[]) {
  return createVirtualFile(name, encodeWav(synthesizeClicks({ sampleRate: 22050, duration: 1, clicks }), 22050))
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

describe('atlas feature', () => {
  it('publishes atlas info on load', () => {
    expect(state().atlas?.regions).toHaveLength(20)
    expect(state().atlas?.pages[0].name).toBe('inspector-demo.png')
  })

  it('exports every region into a zip', async () => {
    expect(await harness.controller.atlas.exportArchive()).toBe(true)
    const saved = harness.saved.at(-1)
    expect(saved?.fileName).toBe('inspector-demo_regions_20.zip')
    const entries = unzipSync(new Uint8Array(await saved!.blob.arrayBuffer()))
    expect(Object.keys(entries)).toContain('sword.png')
    expect(decodePng(entries['sword.png'])).toMatchObject({ width: 110, height: 16 })
    expect(state().exportStatus).toMatchObject({ kind: 'atlas', busy: false })
    expect(state().exportStatus.message).toContain('20 張碎圖')
  })

  it('exports a single region png', async () => {
    expect(await harness.controller.atlas.exportRegion('head')).toBe(true)
    const saved = harness.saved.at(-1)
    expect(saved?.fileName).toBe('head.png')
    expect(decodePng(new Uint8Array(await saved!.blob.arrayBuffer()))).toMatchObject({ width: 64, height: 64 })
    expect(await harness.controller.atlas.exportRegion('missing')).toBe(false)
  })

  it('hot swaps a region texture and restores it', async () => {
    const before = harness.stage.textures.length
    expect(await harness.controller.atlas.replaceRegionImage('sword', solidPng(40, 10))).toBe(true)
    expect(harness.stage.textures.length).toBe(before + 1)
    expect(state().regionOverrides.sword).toEqual({ fileName: 'magenta.png', width: 40, height: 10, attachments: 1 })
    expect(state().selectedRegion).toBe('sword')
    expect(state().audit?.metrics.find((metric) => metric.id === 'drawCalls')?.value).toBe(3)
    const weapon = harness.controller.instance?.skeleton.findSlot('weapon')?.getAttachment() as unknown as { region: { texture: unknown } }
    expect(weapon.region.texture).toBe(harness.stage.textures.at(-1))
    expect(await harness.controller.atlas.replaceRegionImage('sword', solidPng(8, 8))).toBe(true)
    expect(state().regionOverrides.sword.width).toBe(8)
    harness.controller.atlas.restoreRegion('sword')
    expect(state().regionOverrides).toEqual({})
    expect(state().audit?.metrics.find((metric) => metric.id === 'drawCalls')?.value).toBe(1)
  })

  it('restores all replacements and rejects bad input', async () => {
    await harness.controller.atlas.replaceRegionImage('head', solidPng(4, 4))
    await harness.controller.atlas.replaceRegionImage('torso', solidPng(4, 4))
    expect(Object.keys(state().regionOverrides)).toEqual(['head', 'torso'])
    harness.controller.atlas.restoreAll()
    expect(state().regionOverrides).toEqual({})
    expect(await harness.controller.atlas.replaceRegionImage('nope', solidPng(4, 4))).toBe(false)
    expect(state().notices.at(-1)?.level).toBe('error')
    expect(await harness.controller.atlas.replaceRegionImage('head', createVirtualFile('bad.png', new Uint8Array([1, 2])))).toBe(false)
  })

  it('passes replacements to export jobs and clears them on reload', async () => {
    let regionOverrides: ReadonlyMap<string, unknown> | null = null
    const fresh = createHarness({
      exporter: {
        screenshot: async (context) => {
          regionOverrides = context.regionOverrides
          return { blob: new Blob(['x']), fileName: 'x.png', width: 1, height: 1, frames: 1 }
        },
        sequence: async () => ({ blob: new Blob(['x']), fileName: 'x.zip', width: 1, height: 1, frames: 1 }),
        webm: async () => ({ blob: new Blob(['x']), fileName: 'x.webm', width: 1, height: 1, frames: 1 }),
        sheet: async () => ({ blob: new Blob(['x']), fileName: 'x.zip', width: 1, height: 1, frames: 1 }),
        supportsWebm: () => true,
        save: () => undefined,
      },
    })
    await fresh.controller.loadDemo()
    await fresh.controller.atlas.replaceRegionImage('head', solidPng(4, 4))
    await fresh.controller.exportScreenshot()
    expect([...(regionOverrides ?? new Map()).keys()]).toEqual(['head'])
    await fresh.controller.loadDemo()
    expect(useInspectorStore.getState().regionOverrides).toEqual({})
  })

  it('selects, filters and toggles whitespace restoration', () => {
    harness.controller.atlas.selectRegion('cape')
    harness.controller.atlas.setFilter('arm')
    harness.controller.atlas.setRestoreWhitespace(false)
    expect(state()).toMatchObject({ selectedRegion: 'cape', regionFilter: 'arm', restoreWhitespace: false })
    expect(harness.controller.atlas.pageImage('inspector-demo.png')?.width).toBe(512)
    expect(harness.controller.atlas.pageImage('missing')).toBeNull()
  })
})

describe('audit feature', () => {
  it('audits on load and after skin or slot changes', () => {
    expect(state().audit?.grade).toBe('good')
    const active = () => state().audit?.metrics.find((metric) => metric.id === 'activeVertices')?.value
    expect(active()).toBe(70)
    harness.controller.setSlotVisible('weapon', false)
    expect(active()).toBe(66)
    harness.controller.setSkins([])
    expect(active()).toBe(58)
    harness.controller.audit.refresh()
    expect(state().audit).not.toBeNull()
  })
})

describe('audio feature', () => {
  it('classifies audio files', () => {
    const wav = clickWav('step.wav', [0])
    expect(classifyFile(wav)).toBe('audio')
    expect(isAudioFile(wav)).toBe(true)
    expect(isTextureFile(createVirtualFile('a.PNG', new Uint8Array(1)))).toBe(true)
  })

  it('loads clips, computes peaks and onsets and auto binds by name', async () => {
    expect(await harness.controller.audio.loadFiles([clickWav('step.wav', [0.02, 0.52]), clickWav('swoosh.wav', [0.3])])).toBe(2)
    const clips = state().audioClips
    expect(clips.map((clip) => clip.baseName)).toEqual(['step', 'swoosh'])
    expect(clips[0].onsets).toHaveLength(2)
    expect(clips[0].peaks.max.length).toBe(2000)
    expect(state().syncClipId).toBe(clips[0].id)
    expect(state().audioBindings).toEqual({ step: clips[0].id })
  })

  it('plays bound clips when events fire and counts hits', async () => {
    await harness.controller.audio.loadFiles([clickWav('step.wav', [0])])
    harness.controller.selectAnimation('walk')
    harness.runFrames(70, 1 / 60)
    expect(state().audioTriggers).toBeGreaterThanOrEqual(2)
    expect(harness.audio.plays.every((play) => play.handle === state().syncClipId)).toBe(true)
    harness.controller.audio.setEnabled(false)
    const before = harness.audio.plays.length
    harness.runFrames(70, 1 / 60)
    expect(harness.audio.plays.length).toBe(before)
    harness.controller.audio.bind('hit', state().audioClips[0].id)
    harness.controller.audio.bind('step', null)
    expect(Object.keys(state().audioBindings)).toEqual(['hit'])
  })

  it('starts timeline sync with offsets and stops on pause', async () => {
    await harness.controller.audio.loadFiles([clickWav('music.wav', [0.1, 0.6])])
    harness.controller.selectAnimation('walk')
    harness.controller.audio.setSyncOffset(0.25)
    harness.controller.setSpeed(0.5)
    expect(harness.controller.playSync()).toBe(true)
    expect(state().syncPlaying).toBe(true)
    expect(harness.audio.plays.at(-1)?.options).toEqual({ offset: 0, delay: 0.5, rate: 0.5, volume: 1 })
    harness.controller.audio.setSyncOffset(-0.2)
    harness.controller.audio.startSyncAt(0.1)
    expect(harness.audio.plays.at(-1)?.options.offset).toBeCloseTo(0.3)
    harness.controller.setPlaying(false)
    expect(state().syncPlaying).toBe(false)
    harness.controller.audio.setSyncOffset(99)
    expect(state().syncOffset).toBe(5)
  })

  it('restarts the sync clip on each loop', async () => {
    await harness.controller.audio.loadFiles([clickWav('music.wav', [0.1])])
    harness.controller.audio.setEnabled(false)
    harness.controller.selectAnimation('run')
    harness.controller.playSync()
    const before = harness.audio.plays.length
    harness.runFrames(40, 1 / 30)
    expect(harness.audio.plays.length).toBeGreaterThan(before)
  })

  it('suggests offsets from event alignment', async () => {
    await harness.controller.audio.loadFiles([clickWav('late.wav', [0.08, 0.58])])
    harness.controller.selectAnimation('walk')
    const offset = harness.controller.audio.applySuggestedOffset()
    expect(offset).toBeCloseTo(-0.08, 1)
    expect(state().syncOffset).toBe(offset)
  })

  it('removes clips and their bindings', async () => {
    await harness.controller.audio.loadFiles([clickWav('step.wav', [0]), clickWav('fx.wav', [0])])
    const [step, fx] = state().audioClips
    harness.controller.audio.removeClip(step.id)
    expect(harness.audio.released).toEqual([step.id])
    expect(state().syncClipId).toBe(fx.id)
    expect(state().audioBindings).toEqual({ fx: fx.id })
    harness.controller.audio.setSyncClip(null)
    expect(harness.controller.playSync()).toBe(false)
    harness.controller.audio.preview(fx.id)
    expect(harness.audio.plays.at(-1)?.handle).toBe(fx.id)
    harness.controller.audio.setVolume(5)
    expect(state().audioVolume).toBe(2)
  })

  it('reports decode failures and missing support', async () => {
    expect(await harness.controller.audio.loadFiles([createVirtualFile('broken.wav', new Uint8Array(4))])).toBe(0)
    const silent = createHarness({ audio: null })
    await silent.controller.loadDemo()
    expect(silent.controller.audio.supported()).toBe(false)
    expect(await silent.controller.audio.loadFiles([clickWav('a.wav', [0])])).toBe(0)
  })
})

describe('layout and export dialog state', () => {
  it('selects tree items, expands nodes and publishes bone readouts', () => {
    expect(state().selection).toEqual({ kind: 'skeleton', name: 'inspector-demo' })
    expect(state().treeExpanded['bone:torso']).toBe(true)
    harness.controller.select({ kind: 'bone', name: 'torso' })
    harness.runFrames(1)
    expect(harness.stage.frames.at(-1)?.highlightBone).toBe('torso')
    harness.controller.select({ kind: 'slot', name: 'weapon' })
    harness.runFrames(1)
    expect(harness.stage.frames.at(-1)?.highlightSlot).toBe('weapon')
    harness.controller.select({ kind: 'animation', name: 'run' })
    expect(state().animation).toBe('run')
    harness.controller.toggleTreeNode('bone:torso')
    expect(state().treeExpanded['bone:torso']).toBe(false)
    harness.controller.setTreeFilter('arm')
    expect(state().treeFilter).toBe('arm')
  })

  it('opens the advanced drawer and export dialog', () => {
    harness.controller.setAdvancedOpen(true, 'atlas')
    expect(state()).toMatchObject({ advancedOpen: true, activeTab: 'atlas' })
    harness.controller.setActiveTab('audio')
    expect(state().activeTab).toBe('audio')
    harness.controller.setExportOpen(true, 'attack')
    expect(state().exportOpen).toBe(true)
    expect(state().exportSettings.animation).toBe('attack')
    harness.controller.setExportOpen(false)
    expect(state().exportOpen).toBe(false)
  })

  it('clamps export settings and dispatches by format', async () => {
    harness.controller.updateExportSettings({ sizeMode: 'fixed', width: 99999, height: 0, startFrame: 5, endFrame: 2, background: '#ABCDEF', columns: 999 })
    expect(state().exportSettings).toMatchObject({ width: 4096, height: 1, startFrame: 5, endFrame: 5, background: '#abcdef', columns: 64 })
    harness.controller.updateExportSettings({ background: 'blue', endFrame: null })
    expect(state().exportSettings).toMatchObject({ background: null, endFrame: null })
    for (const format of ['sequence', 'sheet', 'frame', 'webm'] as const) {
      harness.controller.updateExportSettings({ format })
      expect(await harness.controller.exportSelected()).toBe(true)
    }
    expect(harness.saved.map((item) => item.fileName)).toEqual(['idle.zip', 'idle_sheet.zip', 'shot.png', 'idle.webm'])
  })
})

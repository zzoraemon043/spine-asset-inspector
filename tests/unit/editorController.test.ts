import { beforeEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { createVirtualFile } from '../../src/core/assets/virtualFile'
import { encodePng } from '../../src/core/image/pngEncode'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import type { ExportJobContext } from '../../src/controller/types'
import type { TexturePixels } from '../../src/core/types'
import { createExporter, createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { decodePng } from '../support/pngDecode'
import { demoSource } from '../support/fakeTexture'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const editor = () => state().editor
const contexts: ExportJobContext<TexturePixels>[] = []

beforeEach(async () => {
  contexts.length = 0
  const saved: Array<{ blob: Blob; fileName: string }> = []
  const exporter = createExporter(saved)
  harness = createHarness({
    exporter: {
      ...exporter,
      sequence: (context, job, onProgress, signal) => {
        contexts.push(context)
        return exporter.sequence(context, job, onProgress, signal)
      },
    },
  })
  harness.saved = saved
  await harness.controller.loadDemo()
})

async function blobText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()))
}

describe('editor feature', () => {
  it('starts with a clean editable document', () => {
    expect(editor()).toMatchObject({ enabled: true, reason: null, dirty: false, canUndo: false, canRedo: false, index: 0 })
    expect(JSON.stringify(editor().document)).toBe(createDemoFiles().skeletonJson)
  })

  it('applies bone edits to the live skeleton and undoes them', () => {
    const controller = harness.controller
    const before = controller.instance!
    expect(controller.editor.setBoneField('head', 'rotation', 45)).toBe(true)
    expect(controller.instance).not.toBe(before)
    expect(controller.instance!.data.findBone('head')!.rotation).toBe(45)
    expect(state().asset!.bones.find((bone) => bone.name === 'head')!.rotation).toBe(45)
    expect(editor()).toMatchObject({ dirty: true, canUndo: true, undoLabel: '骨骼 head：旋轉 45', revision: 1 })
    expect(controller.editor.setBoneField('head', 'rotation', 45)).toBe(false)
    expect(controller.editor.undo()).toBe(true)
    expect(controller.instance!.data.findBone('head')!.rotation).toBe(before.data.findBone('head')!.rotation)
    expect(editor()).toMatchObject({ dirty: false, canUndo: false, canRedo: true })
    expect(controller.editor.redo()).toBe(true)
    expect(controller.instance!.data.findBone('head')!.rotation).toBe(45)
    expect(controller.editor.redo()).toBe(false)
  })

  it('keeps playback, skins, layers and slot overrides across rebuilds', () => {
    const controller = harness.controller
    controller.selectAnimation('walk')
    controller.setPlaying(false)
    controller.seek(0.3)
    controller.addLayer()
    controller.setSlotVisible('head', false)
    controller.toggleSkin('helmet/knight')
    const skins = state().activeSkins
    controller.editor.setBoneField('hip', 'y', 150)
    const instance = controller.instance!
    expect(state().animation).toBe('walk')
    expect(state().playing).toBe(false)
    expect(instance.paused).toBe(true)
    expect(instance.snapshot().time).toBeCloseTo(0.3, 3)
    expect(instance.skins).toEqual(skins)
    expect(instance.state.getCurrent(1)?.animation?.name).toBe('shoot')
    expect(instance.getSlotOverrides().get('head')).toEqual({ visible: false, attachment: undefined })
    expect(instance.skeleton.findSlot('head')!.getAttachment()).toBeNull()
  })

  it('follows renamed selections and falls back when the target disappears', () => {
    const controller = harness.controller
    controller.select({ kind: 'bone', name: 'head' })
    expect(controller.editor.renameBone('head', ' noggin ')).toBe(true)
    expect(state().selection).toEqual({ kind: 'bone', name: 'noggin' })
    expect(state().asset!.bones.some((bone) => bone.name === 'noggin')).toBe(true)
    controller.editor.undo()
    expect(state().selection).toEqual({ kind: 'skeleton', name: state().asset!.name })
    controller.select({ kind: 'attachment', name: 'head', slot: 'head' })
    controller.editor.renameSlot('head', 'face')
    expect(state().selection).toEqual({ kind: 'attachment', name: 'head', slot: 'face' })
    controller.select({ kind: 'animation', name: 'walk' })
    controller.editor.renameAnimation('walk', 'stroll')
    expect(state().selection).toEqual({ kind: 'animation', name: 'stroll' })
    expect(state().animation).toBe('stroll')
    controller.editor.deleteAnimation('stroll')
    expect(state().selection?.kind).toBe('skeleton')
    expect(state().animation).toBe('idle')
    controller.select({ kind: 'event', name: 'hit' })
    controller.editor.renameEvent('hit', 'impact')
    expect(state().selection).toEqual({ kind: 'event', name: 'impact' })
  })

  it('rejects invalid edits with a notice and leaves history untouched', () => {
    const controller = harness.controller
    expect(controller.editor.renameBone('head', 'torso')).toBe(false)
    expect(state().notices.at(-1)).toMatchObject({ level: 'error', text: '骨骼名稱已存在：torso' })
    expect(controller.editor.setSlotColor('head', 'color', 'zzz')).toBe(false)
    expect(controller.editor.setEventField('hit', 'int', 1.5)).toBe(false)
    expect(editor().canUndo).toBe(false)
  })

  it('edits slots, events, animations and fps through the controller', () => {
    const controller = harness.controller
    expect(controller.editor.setSlotColor('head', 'color', 'ff000080')).toBe(true)
    expect(controller.instance!.data.findSlot('head')!.color.r).toBe(1)
    expect(controller.editor.setSlotBlend('head', 'additive')).toBe(true)
    expect(controller.editor.setSlotAttachment('head', null)).toBe(true)
    expect(controller.instance!.data.findSlot('head')!.attachmentName).toBeNull()
    expect(controller.editor.setEventField('hit', 'string', 'boom')).toBe(true)
    expect(state().asset!.events.find((event) => event.name === 'hit')!.stringValue).toBe('boom')
    expect(controller.editor.duplicateAnimation('idle')).toBe(true)
    expect(state().asset!.animations.map((animation) => animation.name)).toContain('idle 複本')
    expect(controller.editor.setFps(24)).toBe(true)
    expect(state().asset!.fps).toBe(24)
    expect(editor().entries.map((entry) => entry.label)).toEqual([
      '插槽 head：顏色 ff000080',
      '插槽 head：混合模式 加亮',
      '插槽 head：預設部件 無',
      '事件 hit：字串 boom',
      '複製動畫 idle 為 idle 複本',
      '骨架影格速率 24',
    ])
    expect(controller.editor.jump(2)).toBe(true)
    expect(editor().index).toBe(2)
    expect(state().asset!.animations.map((animation) => animation.name)).not.toContain('idle 複本')
    expect(controller.editor.jump(0)).toBe(true)
    expect(JSON.stringify(editor().document)).toBe(createDemoFiles().skeletonJson)
  })

  it('saves Spine 4.2 JSON and clears the dirty flag', async () => {
    const controller = harness.controller
    controller.editor.setBoneField('head', 'x', 7)
    expect(controller.editor.saveJson()).toBe(true)
    const saved = harness.saved.at(-1)!
    expect(saved.fileName).toBe('inspector-demo.json')
    const json = JSON.parse(await blobText(saved.blob))
    expect(json.skeleton.spine).toMatch(/^4\.2/)
    expect(json.bones.find((bone: { name: string }) => bone.name === 'head').x).toBe(7)
    expect(editor()).toMatchObject({ dirty: false, savedIndex: 1 })
    controller.editor.undo()
    expect(editor().dirty).toBe(true)
  })

  it('exports a project zip with json, atlas and lossless pages', async () => {
    const controller = harness.controller
    controller.editor.renameAnimation('idle', 'rest')
    expect(await controller.editor.exportProject()).toBe(true)
    const saved = harness.saved.at(-1)!
    expect(saved.fileName).toBe('inspector-demo_project.zip')
    const entries = unzipSync(new Uint8Array(await saved.blob.arrayBuffer()))
    expect(Object.keys(entries).sort()).toEqual(['inspector-demo.atlas', 'inspector-demo.json', 'inspector-demo.png'])
    const files = createDemoFiles()
    expect(new TextDecoder().decode(entries['inspector-demo.atlas'])).toBe(files.atlasText)
    expect(Object.keys(JSON.parse(new TextDecoder().decode(entries['inspector-demo.json'])).animations)).toContain('rest')
    expect(Buffer.from(decodePng(entries['inspector-demo.png']).pixels)).toEqual(Buffer.from(files.texture.pixels))
    expect(state().exportStatus.message).toContain('3 個檔案')
    expect(editor().dirty).toBe(false)
  })

  it('feeds the edited document to exporters only after a change', async () => {
    const controller = harness.controller
    await controller.exportSequence()
    expect(contexts[0].source.skeleton.data).toBe(createDemoFiles().skeletonJson)
    controller.editor.setBoneField('head', 'y', 3)
    await controller.exportSequence()
    expect(contexts[1].source.skeleton.format).toBe('json')
    expect(JSON.parse(contexts[1].source.skeleton.data as string).bones.find((bone: { name: string }) => bone.name === 'head').y).toBe(3)
  })

  it('keeps region replacements when the skeleton is rebuilt', async () => {
    const controller = harness.controller
    const pixels = new Uint8ClampedArray(40 * 10 * 4).fill(255)
    expect(await controller.atlas.replaceRegionImage('sword', createVirtualFile('s.png', encodePng({ width: 40, height: 10, pixels })))).toBe(true)
    controller.editor.setBoneField('head', 'x', 2)
    const regionOf = (entry: { attachment: unknown }) => (entry.attachment as { region?: { name: string; page: { name: string } } }).region
    const holders = controller.instance!.data.skins.flatMap((skin) => skin.getAttachments()).filter((entry) => regionOf(entry)?.name === 'sword')
    expect(holders.length).toBeGreaterThan(0)
    for (const entry of holders) expect(regionOf(entry)!.page.name).toContain(':override')
    controller.atlas.restoreRegion('sword')
    for (const entry of holders) expect(regionOf(entry)!.page.name).toBe('inspector-demo.png')
  })

  it('disables editing for sources without a document', () => {
    const controller = harness.controller
    controller.editor.onAssetLoaded(null, '僅供檢視')
    expect(editor()).toMatchObject({ enabled: false, reason: '僅供檢視', document: null })
    expect(controller.editor.setBoneField('head', 'x', 1)).toBe(false)
    expect(state().notices.at(-1)).toMatchObject({ level: 'warning', text: '僅供檢視' })
    expect(controller.editor.saveJson()).toBe(false)
    expect(controller.editor.undo()).toBe(false)
    const source = demoSource()
    expect(controller.editor.exportSource(source)).toBe(source)
    controller.editor.reset()
    expect(editor().reason).toBeNull()
  })
})

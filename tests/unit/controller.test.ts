import { beforeEach, describe, expect, it } from 'vitest'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { demoSource } from '../support/fakeTexture'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const live = () => useLiveStore.getState()

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

describe('InspectorController loading', () => {
  it('loads the demo asset into the store', () => {
    expect(state().status).toBe('ready')
    expect(state().asset?.name).toBe('inspector-demo')
    expect(state().animation).toBe('idle')
    expect(state().activeSkins).toEqual(['armor/red', 'helmet/knight', 'weapon/sword'])
    expect(state().transition).toMatchObject({ from: 'idle', to: 'walk' })
    expect(state().exportSettings.animation).toBe('idle')
    expect(state().notices.at(-1)?.level).toBe('success')
    expect(harness.stage.textures).toHaveLength(1)
    expect(harness.stage.view.scale).toBeGreaterThan(0.5)
  })

  it('renders frames with the live skeleton', () => {
    harness.runFrames(3)
    const frame = harness.stage.frames.at(-1)
    expect(frame?.skeleton).toBe(harness.controller.instance?.skeleton)
    expect(frame?.premultipliedAlpha).toBe(false)
    expect(live().snapshot.tracks[0].animation).toBe('idle')
  })

  it('disposes previous textures when reloading', async () => {
    const first = harness.stage.textures[0]
    let disposed = false
    first.dispose = () => {
      disposed = true
    }
    await harness.controller.loadDemo()
    expect(disposed).toBe(true)
  })

  it('keeps the previous asset when a load fails', async () => {
    const ok = await harness.controller.loadFiles([])
    expect(ok).toBe(false)
    expect(state().status).toBe('ready')
    expect(state().error).toBe('local source unavailable')
    expect(state().notices.at(-1)?.level).toBe('error')
  })

  it('shows a notice when the picked files are over the size limit', async () => {
    const huge = { name: 'huge.skel', size: 600 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File
    expect(await harness.controller.readInput([huge])).toBeNull()
    expect(state().notices.at(-1)).toMatchObject({ level: 'error', text: '輸入檔案總容量超過 512 MB 上限' })
  })

  it('enters the error state when nothing is loaded', async () => {
    const fresh = createHarness({ createDemoSource: async () => ({ ...demoSource(), atlasText: 'broken' }) })
    expect(await fresh.controller.loadDemo()).toBe(false)
    expect(useInspectorStore.getState().status).toBe('error')
  })

  it('selects the first non-default skin for local assets with an empty default skin', async () => {
    const fresh = createHarness({
      createLocalSource: async () => {
        const source = demoSource()
        const json = JSON.parse(source.skeleton.data as string)
        json.skins[0].attachments = {}
        return { ...source, origin: 'local' as const, skeleton: { ...source.skeleton, data: JSON.stringify(json) } }
      },
    })
    await fresh.controller.loadFiles([])
    expect(useInspectorStore.getState().activeSkins).toEqual(['armor/red'])
  })
})

describe('InspectorController playback', () => {
  it('switches animations with and without mixing', () => {
    harness.runFrames(5)
    harness.controller.selectAnimation('walk')
    harness.runFrames(1)
    expect(state().animation).toBe('walk')
    expect(live().snapshot.tracks[0].mixingFrom).toBe('idle')
    harness.controller.setMixOnSwitch(false)
    harness.controller.selectAnimation('run')
    harness.runFrames(1)
    expect(live().snapshot.tracks[0].mixingFrom).toBeNull()
    harness.controller.selectAnimation('missing')
    expect(state().animation).toBe('run')
  })

  it('pauses, steps and seeks', () => {
    harness.controller.selectAnimation('walk')
    harness.controller.step(1)
    expect(state().playing).toBe(false)
    expect(live().snapshot.frame).toBe(1)
    harness.controller.step(-1)
    expect(live().snapshot.frame).toBe(0)
    harness.controller.seekFrame(12)
    expect(live().snapshot.frame).toBe(12)
    harness.runFrames(10)
    expect(live().snapshot.frame).toBe(12)
    harness.controller.togglePlay()
    harness.runFrames(6, 1 / 30)
    expect(live().snapshot.frame).toBe(18)
  })

  it('restarts a finished non looping animation on play', () => {
    harness.controller.setLoop(false)
    harness.controller.selectAnimation('hit')
    harness.runFrames(40)
    expect(live().snapshot.time).toBeCloseTo(0.4)
    harness.controller.setPlaying(false)
    harness.controller.setPlaying(true)
    expect(live().snapshot.time).toBe(0)
  })

  it('scrubs while paused and resumes afterwards', () => {
    harness.controller.beginScrub()
    expect(state().playing).toBe(false)
    harness.controller.seek(0.5)
    harness.controller.endScrub()
    expect(state().playing).toBe(true)
    expect(live().snapshot.time).toBeCloseTo(0.5)
  })

  it('clamps the playback speed', () => {
    harness.controller.setSpeed(9)
    expect(state().speed).toBe(2)
    harness.controller.setSpeed(0.1)
    expect(harness.controller.instance?.timeScale).toBeCloseTo(0.1)
  })
})

describe('InspectorController mix lab', () => {
  it('runs an A to B transition after the hold time', () => {
    harness.controller.setTransition({ from: 'idle', to: 'run', duration: 0.3, hold: 0.2 })
    harness.controller.runTransition()
    expect(harness.controller.isTransitionPending()).toBe(true)
    expect(state().animation).toBe('idle')
    harness.runFrames(10, 1 / 30)
    expect(harness.controller.isTransitionPending()).toBe(false)
    expect(state().animation).toBe('run')
    harness.runFrames(1, 1 / 30)
    expect(live().snapshot.tracks[0].mixingFrom).toBe('idle')
    expect(live().snapshot.tracks[0].mixDuration).toBeCloseTo(0.3)
  })

  it('runs the reverse transition', () => {
    harness.controller.setTransition({ from: 'idle', to: 'run', hold: 0 })
    harness.controller.runTransition(true)
    expect(state().animation).toBe('run')
    harness.runFrames(2)
    expect(state().animation).toBe('idle')
  })

  it('cancels a pending transition when the user picks another animation', () => {
    harness.controller.setTransition({ hold: 5 })
    harness.controller.runTransition()
    harness.controller.selectAnimation('attack')
    expect(harness.controller.isTransitionPending()).toBe(false)
  })

  it('clamps transition settings and default mix', () => {
    harness.controller.setTransition({ duration: 9, hold: -1 })
    expect(state().transition.duration).toBe(2)
    expect(state().transition.hold).toBe(0)
    harness.controller.setDefaultMix(0.456)
    expect(state().defaultMix).toBe(0.46)
    expect(harness.controller.instance?.stateData.defaultMix).toBeCloseTo(0.46)
  })

  it('manages mix pairs', () => {
    harness.controller.upsertMixPair({ from: 'walk', to: 'run', duration: 0.5 })
    harness.controller.upsertMixPair({ from: 'walk', to: 'run', duration: 0.7 })
    expect(state().mixPairs).toEqual([{ from: 'walk', to: 'run', duration: 0.7 }])
    expect(harness.controller.instance?.getMix('walk', 'run')).toBeCloseTo(0.7)
    harness.controller.removeMixPair('walk', 'run')
    expect(state().mixPairs).toEqual([])
    expect(harness.controller.instance?.getMix('walk', 'run')).toBeCloseTo(state().defaultMix)
  })

  it('adds, edits and removes track layers', () => {
    harness.controller.selectAnimation('run')
    harness.controller.addLayer()
    expect(state().layers).toEqual([{ index: 1, animation: 'shoot', loop: true, alpha: 1, blend: 'replace', enabled: true }])
    harness.runFrames(2)
    expect(live().snapshot.tracks.map((track) => track.animation)).toEqual(['run', 'shoot'])
    harness.controller.updateLayer(1, { alpha: 0.25 })
    expect(harness.controller.instance?.state.getCurrent(1)?.alpha).toBeCloseTo(0.25)
    harness.controller.updateLayer(1, { animation: 'hit', loop: false })
    expect(harness.controller.instance?.state.getCurrent(1)?.animation?.name).toBe('hit')
    harness.controller.updateLayer(1, { enabled: false })
    expect(harness.controller.instance?.state.getCurrent(1)?.animation?.name).toBe('<empty>')
    harness.controller.addLayer()
    harness.controller.addLayer()
    harness.controller.addLayer()
    expect(state().layers.map((layer) => layer.index)).toEqual([1, 2, 3])
    harness.controller.removeLayer(2)
    expect(state().layers.map((layer) => layer.index)).toEqual([1, 3])
    harness.controller.addLayer()
    expect(state().layers.map((layer) => layer.index)).toEqual([1, 2, 3])
    harness.controller.updateLayer(9, { alpha: 0 })
  })
})

describe('InspectorController skins, slots and debug', () => {
  it('toggles and solos skins', () => {
    harness.controller.toggleSkin('helmet/knight')
    expect(state().activeSkins).toEqual(['armor/red', 'weapon/sword'])
    harness.controller.toggleSkin('helmet/cap')
    expect(state().activeSkins).toEqual(['armor/red', 'helmet/cap', 'weapon/sword'])
    harness.controller.soloSkin('armor/blue')
    expect(state().activeSkins).toEqual(['armor/blue'])
    expect(live().attachments.weapon).toBeNull()
  })

  it('writes slot overrides through to the instance', () => {
    harness.controller.setSlotVisible('weapon', false)
    expect(state().slotOverrides.weapon).toEqual({ visible: false, attachment: undefined })
    expect(live().attachments.weapon).toBeNull()
    harness.controller.setSlotVisible('weapon', true)
    expect(state().slotOverrides.weapon).toBeUndefined()
    harness.controller.setSlotAttachment('helmet', null)
    expect(live().attachments.helmet).toBeNull()
    harness.controller.resetSlot('helmet')
    expect(live().attachments.helmet).toBe('helmet')
    harness.controller.setSlotVisible('cape', false)
    harness.controller.setSlotVisible('torso', false)
    harness.controller.resetAllSlots()
    expect(state().slotOverrides).toEqual({})
    expect(live().attachments.cape).toBe('cape')
  })

  it('selects slots for highlighting', () => {
    harness.controller.selectSlot('weapon')
    harness.runFrames(1)
    expect(harness.stage.frames.at(-1)?.highlightSlot).toBe('weapon')
    harness.controller.selectSlot('weapon')
    expect(state().selectedSlot).toBeNull()
  })

  it('toggles debug overlays', () => {
    harness.controller.toggleDebug('bones')
    harness.runFrames(1)
    expect(harness.stage.frames.at(-1)?.debug.bones).toBe(true)
    harness.controller.setAllDebug(true)
    expect(Object.values(state().debug).every(Boolean)).toBe(true)
    harness.controller.setAllDebug(false)
    expect(Object.values(state().debug).some(Boolean)).toBe(false)
    harness.controller.toggleAxes()
    expect(state().showAxes).toBe(false)
    harness.controller.setBackground('chroma')
    expect(state().background).toBe('chroma')
  })
})

describe('InspectorController events', () => {
  it('records custom events with parameters', () => {
    harness.controller.selectAnimation('attack')
    harness.runFrames(30, 1 / 30)
    const names = state().eventLog.map((record) => record.name)
    expect(names).toContain('hit')
    expect(names).toContain('fx')
    const hit = state().eventLog.find((record) => record.name === 'hit')
    expect(hit).toMatchObject({ kind: 'custom', intValue: 25, stringValue: 'slash', track: 0, animation: 'attack' })
    expect(hit?.id).toBeGreaterThan(0)
  })

  it('records lifecycle events only when enabled', () => {
    harness.controller.selectAnimation('walk')
    harness.runFrames(5)
    expect(state().eventLog.every((record) => record.kind === 'custom')).toBe(true)
    harness.controller.setShowLifecycle(true)
    harness.controller.selectAnimation('run')
    harness.runFrames(5)
    expect(state().eventLog.some((record) => record.kind === 'start')).toBe(true)
  })

  it('pauses capture and clears the log', () => {
    harness.controller.setEventCapture(false)
    harness.controller.selectAnimation('run')
    harness.runFrames(60)
    expect(state().eventLog).toHaveLength(0)
    harness.controller.setEventCapture(true)
    harness.runFrames(60)
    expect(state().eventLog.length).toBeGreaterThan(0)
    harness.controller.clearEvents()
    expect(state().eventLog).toHaveLength(0)
    harness.controller.setEventFilter('step')
    expect(state().eventFilter).toBe('step')
  })
})

describe('InspectorController viewport', () => {
  it('fits, zooms, pans and reports pointer coordinates', () => {
    harness.controller.resetZoom()
    expect(harness.stage.view.scale).toBe(1)
    harness.controller.zoomBy(2)
    expect(live().zoom).toBe(2)
    const before = harness.stage.view
    harness.controller.panBy(20, 0)
    expect(harness.stage.view.centerX).toBeCloseTo(before.centerX - 10)
    harness.controller.updatePointer(400, 300)
    expect(live().pointer).toEqual({ x: Math.round(harness.stage.view.centerX * 10) / 10, y: Math.round(harness.stage.view.centerY * 10) / 10 })
    harness.controller.updatePointer(null, null)
    expect(live().pointer).toBeNull()
    harness.controller.fitView()
    expect(harness.stage.view.scale).toBeGreaterThan(0.5)
  })

  it('detaches and disposes the stage', () => {
    harness.controller.detachStage()
    expect(harness.stage.disposed).toBe(true)
    expect(harness.controller.instance).toBeNull()
  })
})

describe('InspectorController export', () => {
  it('saves screenshot, sequence and webm results', async () => {
    expect(await harness.controller.exportScreenshot()).toBe(true)
    harness.controller.updateExportSettings({ animation: 'walk', fps: 500, scale: 99, padding: -4, loops: 0 })
    expect(state().exportSettings).toMatchObject({ animation: 'walk', fps: 120, scale: 8, padding: 0, loops: 1 })
    expect(await harness.controller.exportSequence()).toBe(true)
    expect(await harness.controller.exportWebm()).toBe(true)
    expect(harness.saved.map((item) => item.fileName)).toEqual(['shot.png', 'walk.zip', 'walk.webm'])
    expect(state().exportStatus).toMatchObject({ busy: false, kind: 'webm', progress: 1, error: null })
    expect(harness.controller.supportsWebm()).toBe(true)
  })

  it('reports export failures', async () => {
    const fresh = createHarness({
      exporter: {
        screenshot: async () => {
          throw new Error('boom')
        },
        sequence: async () => {
          throw new Error('boom')
        },
        webm: async () => {
          throw new Error('boom')
        },
        sheet: async () => {
          throw new Error('boom')
        },
        supportsWebm: () => false,
        save: () => undefined,
      },
    })
    await fresh.controller.loadDemo()
    expect(await fresh.controller.exportScreenshot()).toBe(false)
    expect(useInspectorStore.getState().exportStatus.error).toBe('boom')
    expect(await fresh.controller.exportWebm()).toBe(false)
    expect(useInspectorStore.getState().exportStatus.error).toBe('此瀏覽器不支援 WebM 錄製')
  })

  it('refuses to export without an asset', async () => {
    const fresh = createHarness()
    expect(await fresh.controller.exportSequence()).toBe(false)
  })
})

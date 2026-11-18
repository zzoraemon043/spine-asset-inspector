import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import type { Skeleton } from '@esotericsoftware/spine-core'
import { exportPngSequence, exportSpriteSheet, exportWebm, ExportPreviewer, type ExportContext, type SequenceOptions } from '../../src/core/export/exporters'
import type { FrameSize, SequenceManifest } from '../../src/core/export/exportPlan'
import { worldToFrame, type FramePlacement } from '../../src/core/export/placement'
import type { ExportImage } from '../../src/core/export/OffscreenSpineRenderer'
import { buildSkeleton } from '../../src/core/spine/skeletonFactory'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import type { AssetSource, Bounds } from '../../src/core/types'
import { demoSource, FakeTexture } from '../support/fakeTexture'

const drawing = vi.hoisted(() => ({ positions: [] as number[], origins: [] as { x: number; y: number }[] }))

vi.mock('../../src/core/export/OffscreenSpineRenderer', () => ({
  OffscreenSpineRenderer: class {
    canvas = { width: 2, height: 2 }
    build(source: AssetSource<ExportImage>) {
      return buildSkeleton(source, (image) => new FakeTexture(image.width, image.height))
    }
    resize({ width, height }: FrameSize) {
      this.canvas = { width, height }
    }
    draw(skeleton: Skeleton, _pma: boolean, _bounds: Bounds, size: FrameSize, _background: unknown, placement: FramePlacement) {
      drawing.positions.push(skeleton.findBone('root')!.worldX)
      drawing.origins.push(worldToFrame({ x: 0, y: 0, width: 0, height: 0 }, size, placement))
    }
    readPixels() {
      const { width, height } = this.canvas
      return { width, height, pixels: new Uint8ClampedArray(width * height * 4) }
    }
    dispose() {}
  },
}))

vi.mock('../../src/core/export/webm', () => ({
  startWebmSession: async () => ({ pushFrame: () => undefined, finish: async () => new Blob() }),
}))

const options: SequenceOptions = {
  animation: 'sample',
  fps: 30,
  startFrame: 0,
  endFrame: 2,
  loops: 1,
  columns: 2,
  sizeMode: 'fixed',
  width: 24,
  height: 32,
  scale: 1,
  padding: 0,
  background: null,
}

function context(duration: number, physics = false): ExportContext {
  const source = demoSource()
  const json = JSON.parse(source.skeleton.data as string)
  json.animations.sample = { bones: { root: { translate: [{ time: 0, x: 0 }, { time: duration, x: 120 }] } } }
  if (physics) json.physics = [{ name: 'sway', bone: 'root', x: 1, fps: 60, strength: 30 }]
  return {
    source: { ...source, skeleton: { ...source.skeleton, data: JSON.stringify(json) } } as unknown as ExportContext['source'],
    skins: ['weapon/sword'],
    overrides: new Map(),
    regionOverrides: new Map(),
  }
}

async function manifest(blob: Blob): Promise<SequenceManifest> {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return JSON.parse(new TextDecoder().decode(files['manifest.json']))
}

beforeEach(() => {
  drawing.positions.length = 0
  drawing.origins.length = 0
  vi.stubGlobal('window', { setTimeout })
})

afterEach(() => vi.unstubAllGlobals())

describe('animation exports', () => {
  it('exports and previews the requested range beyond frame 599', async () => {
    const asset = context(30)
    const range = { ...options, startFrame: 700, endFrame: 710 }
    const result = await exportPngSequence(asset, range, () => undefined, { cancelled: false })
    const info = await manifest(result.blob)
    expect(result.frames).toBe(11)
    expect(info.frames[0]).toMatchObject({ file: expect.stringMatching(/_0700\.png$/), time: 23.333333 })
    expect(info.frames.at(-1)?.file).toMatch(/_0710\.png$/)
    const previewer = new ExportPreviewer()
    expect(previewer.render(asset, { key: 'range', options: range, frame: 10, maxWidth: 40, maxHeight: 40 })).toMatchObject({ firstFrame: 700, frame: 10, frameCount: 11 })
    previewer.dispose()
  })

  it('warms up physics before the selected range and uses the same poses in each format and preview', async () => {
    const asset = context(1, true)
    const range = { ...options, fps: 60, startFrame: 12, endFrame: 14 }
    const reference = new SpineInstance(buildSkeleton(asset.source, (image) => new FakeTexture(image.width, image.height)).data)
    reference.setSkins(asset.skins)
    reference.setTrack(0, options.animation, { loop: false, resetPose: true })
    const expected: number[] = []
    for (let frame = 1; frame <= 14; frame++) {
      reference.advance(1 / 60)
      if (frame >= 12) expected.push(reference.skeleton.findBone('root')!.worldX)
    }
    reference.seek(12 / 60)
    expect(expected[0]).not.toBeCloseTo(reference.skeleton.findBone('root')!.worldX, 1)

    for (const exporter of [exportPngSequence, exportSpriteSheet, exportWebm]) {
      drawing.positions.length = 0
      await exporter(asset, range, () => undefined, { cancelled: false })
      expect(drawing.positions).toHaveLength(expected.length)
      drawing.positions.forEach((position, index) => expect(position).toBeCloseTo(expected[index], 5))
    }
    const previewer = new ExportPreviewer()
    for (const frame of [2, 0, 1]) {
      previewer.render(asset, { key: 'sway', options: range, frame, maxWidth: 40, maxHeight: 40 })
      expect(drawing.positions.at(-1)).toBeCloseTo(expected[frame], 5)
    }
    previewer.dispose()
  })

  it('projects manifest origin through rendered alignment and offsets', async () => {
    const asset = context(1)
    const origins = []
    for (const offsetX of [0, 40]) {
      const result = await exportPngSequence(asset, { ...options, width: 80, align: 'bottom', offsetX, offsetY: -7 }, () => undefined, { cancelled: false })
      const { origin } = await manifest(result.blob)
      const drawn = drawing.origins.at(-1)!
      expect(origin.x).toBeCloseTo(drawn.x, 2)
      expect(origin.y).toBeCloseTo(drawn.y, 2)
      origins.push(origin)
    }
    expect(origins[1].x - origins[0].x).toBeCloseTo(40, 2)
  })
})

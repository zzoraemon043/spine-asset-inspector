import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LegacyBinaryInput } from '../../src/core/legacy/binaryInput'
import { absoluteCurve, rgb888, rgba8888, rgbaChannels, unwrapRotations } from '../../src/core/legacy/curves'
import { convertSpine36Binary, isSpine36, LegacyFormatError } from '../../src/core/legacy/spine36Binary'
import { buildSkeleton, SkeletonBuildError } from '../../src/core/spine/skeletonFactory'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { summarize } from '../../src/core/spine/summarize'
import { detectBinaryVersion } from '../../src/core/spine/versionDetect'
import type { AssetSource } from '../../src/core/types'
import { FakeTexture } from '../support/fakeTexture'
import { buildSpine36Fixture, FIXTURE_ATLAS, Spine36Writer } from '../support/spine36Writer'

type Json = Record<string, any>

function fixtureSource(bytes: Uint8Array, atlasText = FIXTURE_ATLAS, page = 'fixture.png'): AssetSource<{ width: number; height: number }> {
  return {
    name: 'fixture',
    origin: 'local',
    skeleton: { fileName: 'fixture.skel', format: 'binary', data: bytes },
    atlasText,
    pages: new Map([[page, { width: 64, height: 64 }]]),
    skeletonCandidates: [],
    warnings: [],
  }
}

function build(bytes = buildSpine36Fixture()) {
  return buildSkeleton(fixtureSource(bytes), () => new FakeTexture(64, 64))
}

describe('legacy binary input', () => {
  it('reads varints, zigzag ints, strings and floats like libgdx DataInput', () => {
    const bytes = new Spine36Writer().varint(300).varint(-2).varint(-7, false).str(null).str('').str('骨架').float(1.5).short(-3).int32(-1).toBytes()
    const input = new LegacyBinaryInput(bytes)
    expect(input.readVarInt(true)).toBe(300)
    expect(input.readVarInt(true)).toBe(-2)
    expect(input.readVarInt(false)).toBe(-7)
    expect(input.readString()).toBeNull()
    expect(input.readString()).toBe('')
    expect(input.readString()).toBe('骨架')
    expect(input.readFloat()).toBe(1.5)
    expect(input.readShort()).toBe(-3)
    expect(input.readInt32()).toBe(-1)
    expect(input.remaining).toBe(0)
    expect(() => input.readByte()).toThrow('提前結束')
  })
})

describe('legacy curve conversion', () => {
  it('converts normalized 3.x beziers into absolute 4.x curves per channel', () => {
    const current = { time: 1, values: [10, 0], curve: [0.25, 0.1, 0.75, 0.9] as const }
    const next = { time: 3, values: [20, -10], curve: 'linear' as const }
    expect(absoluteCurve(current, next)).toEqual([1.5, 11, 2.5, 19, 1.5, -1, 2.5, -9])
    expect(absoluteCurve({ ...current, curve: 'stepped' }, next)).toBe('stepped')
    expect(absoluteCurve({ ...current, curve: 'linear' }, next)).toBeNull()
  })

  it('unwraps rotations along the shortest path like the 3.6 runtime', () => {
    expect(unwrapRotations([170, -170])).toEqual([170, 190])
    expect(unwrapRotations([-170, 170, 10])).toEqual([-170, -190, -350])
    expect(unwrapRotations([0, 90, 180])).toEqual([0, 90, 180])
    expect(unwrapRotations([0, 270])).toEqual([0, -90])
  })

  it('formats colors', () => {
    expect(rgba8888(-1)).toBe('ffffffff')
    expect(rgba8888(0x00ff0080)).toBe('00ff0080')
    expect(rgb888(0x112233)).toBe('112233')
    expect(rgbaChannels(0xff000080)).toEqual([1, 0, 0, 128 / 255])
  })
})

describe('spine 3.6 binary conversion', () => {
  const conversion = convertSpine36Binary(buildSpine36Fixture())
  const json = conversion.json as Json

  it('consumes every byte and reports the source version', () => {
    expect(conversion.sourceVersion).toBe('3.6.52')
    expect(conversion.warnings).toEqual([])
    expect(json.skeleton).toMatchObject({ spine: '4.2.0', legacyVersion: '3.6.52', fps: 30, width: 100, height: 200 })
    expect(isSpine36('3.6.53')).toBe(true)
    expect(isSpine36('3.8.75')).toBe(false)
    expect(detectBinaryVersion(buildSpine36Fixture('3.6.53'))).toBe('3.6.53')
  })

  it('maps setup data to 4.2 field names', () => {
    expect(json.bones[2]).toMatchObject({ name: 'tip', parent: 'arm', inherit: 'noRotationOrReflection', color: '0000ffff' })
    expect(json.slots[1]).toMatchObject({ name: 'arm', bone: 'arm', color: 'ff8080ff', dark: '112233', attachment: 'mesh', blend: 'additive' })
    expect(json.slots[2].attachment).toBeUndefined()
    expect(json.ik[0]).toMatchObject({ name: 'reach', bones: ['arm'], target: 'tip', mix: 0.75, bendPositive: false })
    expect(json.transform[0]).toMatchObject({ name: 'follow', relative: true, local: false, mixRotate: 0.5, mixX: 0.6, mixY: 0.6, mixScaleX: 0.7, mixScaleY: 0.7, mixShearY: 0.8 })
    expect(json.path[0]).toMatchObject({ name: 'rail', target: 'trail', positionMode: 'percent', spacingMode: 'percent', rotateMode: 'chain', mixX: 0.9 })
    expect(json.events.hit).toEqual({ int: -5, float: 1.5, string: 'boom' })
  })

  it('maps every attachment type', () => {
    const skin = json.skins[0].attachments
    expect(skin.body.body).toMatchObject({ path: 'body-region', width: 20, height: 40 })
    expect(skin.arm.mesh).toMatchObject({ type: 'mesh', hull: 3, triangles: [0, 1, 2], vertices: [0, 0, 10, 0, 0, 10], edges: [0, 2, 2, 4, 4, 0] })
    expect(skin.arm.box).toMatchObject({ type: 'boundingbox', vertexCount: 3, vertices: [1, 1, 0, 0, 1, 1, 1, 5, 0, 1, 1, 1, 0, 5, 1], color: '00ff00ff' })
    expect(skin.clip.clipper).toMatchObject({ type: 'clipping', end: 'trail', vertexCount: 3 })
    expect(skin.trail.trail).toMatchObject({ type: 'path', closed: false, constantSpeed: true, vertexCount: 6, lengths: [7, 8] })
    expect(json.skins[1]).toMatchObject({ name: 'alt', attachments: { arm: { mesh: { type: 'linkedmesh', parent: 'mesh', timelines: true } } } })
  })

  it('maps every timeline type with absolute curves', () => {
    const act = json.animations.act
    expect(act.slots.arm.attachment).toEqual([{ time: 0, name: 'mesh' }, { time: 0.5, name: null }])
    expect(act.slots.arm.rgba[0]).toEqual({ time: 0, color: 'ffffffff' })
    expect(act.slots.arm.rgba2[0]).toEqual({ time: 0, light: 'ffffffff', dark: '000000', curve: 'stepped' })
    expect(act.bones.arm.rotate).toEqual([{ time: 0, value: 170, curve: [0.25, 170, 0.75, 190] }, { time: 1, value: 190 }])
    expect(act.bones.arm.translate[0]).toEqual({ time: 0, x: 0, y: 0, curve: 'stepped' })
    expect(act.bones.arm.scale[1]).toEqual({ time: 1, x: 2, y: 2 })
    expect(act.ik.reach).toEqual([{ time: 0, mix: 1, bendPositive: true }, { time: 1, mix: 0, bendPositive: false }])
    expect(act.transform.follow[0]).toMatchObject({ mixRotate: 1, mixX: 1, mixY: 1, mixScaleX: 1, mixScaleY: 1, mixShearY: 1 })
    expect(act.path.rail).toMatchObject({ position: [{ time: 0, value: 0.2 }], spacing: [{ time: 0, value: 0.3 }] })
    expect(act.attachments.default.arm.mesh.deform[0].curve).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(act.attachments.default.arm.mesh.deform[1]).toEqual({ time: 1, offset: 2, vertices: [3, 4] })
    expect(act.drawOrder).toEqual([{ time: 0.5, offsets: [{ slot: 'trail', offset: -2 }] }])
    expect(act.events).toEqual([{ time: 0.25, name: 'hit', int: 7, float: 2.5, string: 'custom' }])
  })

  it('rejects other versions and truncated data', () => {
    expect(() => convertSpine36Binary(buildSpine36Fixture('3.8.75'))).toThrow(LegacyFormatError)
    expect(() => convertSpine36Binary(buildSpine36Fixture().slice(0, 120))).toThrow(/3\.6/)
  })
})

describe('spine 3.6 runtime behaviour after upgrade', () => {
  it('builds skeleton data through the 4.2 runtime and reports the upgrade', () => {
    const result = build()
    expect(result.legacy).toEqual({ sourceVersion: '3.6.52', warnings: [] })
    expect(result.version.raw).toBe('3.6.52')
    expect(result.data.skins.map((skin) => skin.name)).toEqual(['default', 'alt'])
    const summary = summarize({
      name: 'fixture',
      origin: 'local',
      format: 'binary',
      fileName: 'fixture.skel',
      data: result.data,
      atlas: result.atlas,
      version: result.version,
      upgradedFrom: result.legacy?.sourceVersion,
      legacyWarnings: result.legacy?.warnings,
      premultipliedAlpha: false,
      skeletonCandidates: [],
      warnings: [],
    })
    expect(summary.upgradedFrom).toBe('3.6.52')
    expect(summary.warnings[0]).toContain('3.6.52')
    expect(summary.warnings.some((warning) => warning.includes('不一致'))).toBe(false)
  })

  it('interpolates rotation across 180 degrees and fires events like 3.6', () => {
    const instance = new SpineInstance(build().data)
    const events: Array<{ name: string; intValue: number; stringValue: string }> = []
    instance.onEvent((event) => {
      if (event.kind === 'custom') events.push(event)
    })
    instance.setTrack(0, 'act', { loop: false })
    instance.advance(0.3)
    expect(events).toEqual([expect.objectContaining({ name: 'hit', intValue: 7, stringValue: 'custom' })])
    instance.seek(0.5)
    const arm = instance.skeleton.findBone('arm')
    expect(arm?.rotation).toBeCloseTo(180, 0)
    instance.seek(0.6)
    expect(instance.currentAttachments().arm).toBeNull()
    instance.seek(1)
    expect(arm?.rotation).toBeCloseTo(190, 3)
    expect(arm?.x).toBeCloseTo(20, 3)
  })

  it('rejects unsupported legacy versions with guidance', () => {
    const json = { ...fixtureSource(buildSpine36Fixture()), skeleton: { fileName: 'x.json', format: 'json' as const, data: '{"skeleton":{"spine":"3.8.75"},"bones":[]}' } }
    expect(() => buildSkeleton(json, () => new FakeTexture(64, 64))).toThrow(/3\.8\.75 JSON 尚未支援/)
    expect(() => buildSkeleton(fixtureSource(buildSpine36Fixture('3.8.75')), () => new FakeTexture(64, 64))).toThrow(SkeletonBuildError)
  })
})

const REAL_ASSETS = [
  { dir: '003妙蛙花', base: 'hero_miaowahua', version: '3.6.52', bones: 302, slots: 180, animations: 7 },
  { dir: '054可达鸭', base: 'hero_kedaya', version: '3.6.53', bones: 100, slots: 67, animations: 9 },
]

describe.each(REAL_ASSETS)('reference asset $base', (asset) => {
  const root = join(__dirname, '..', '..', asset.dir)
  const available = existsSync(join(root, `${asset.base}.skel`))

  it.skipIf(!available)('converts without leftover bytes and plays every animation', () => {
    const bytes = new Uint8Array(readFileSync(join(root, `${asset.base}.skel`)))
    const conversion = convertSpine36Binary(bytes)
    expect(conversion.sourceVersion).toBe(asset.version)
    expect(conversion.warnings).toEqual([])
    const atlas = readFileSync(join(root, `${asset.base}.atlas`), 'utf8')
    const result = buildSkeleton(fixtureSource(bytes, atlas, `${asset.base}.png`), () => new FakeTexture(1024, 1024))
    expect(result.data.bones).toHaveLength(asset.bones)
    expect(result.data.slots).toHaveLength(asset.slots)
    expect(result.data.animations).toHaveLength(asset.animations)
    const instance = new SpineInstance(result.data)
    for (const animation of result.data.animations) {
      instance.setTrack(0, animation.name, { loop: true, resetPose: true })
      for (let step = 0; step < 12; step++) instance.advance(animation.duration / 12)
      for (const bone of instance.skeleton.bones) {
        expect(Number.isFinite(bone.worldX) && Number.isFinite(bone.worldY) && Number.isFinite(bone.a)).toBe(true)
      }
    }
  })
})

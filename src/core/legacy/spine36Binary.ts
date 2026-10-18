import { LegacyBinaryInput } from './binaryInput'
import { attachCurves, rgb888, rgba8888, rgbaChannels, rgbChannels, unwrapRotations, type LegacyCurve, type LegacyKey } from './curves'

type Json = Record<string, unknown>

const TRANSFORM_MODES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']
const BLEND_MODES = ['normal', 'additive', 'multiply', 'screen']
const ATTACHMENT_TYPES = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping']
const POSITION_MODES = ['fixed', 'percent']
const SPACING_MODES = ['length', 'fixed', 'percent']
const ROTATE_MODES = ['tangent', 'chain', 'chainScale']

const BONE_ROTATE = 0
const BONE_TRANSLATE = 1
const BONE_SCALE = 2
const BONE_SHEAR = 3
const SLOT_ATTACHMENT = 0
const SLOT_COLOR = 1
const SLOT_TWO_COLOR = 2
const PATH_POSITION = 0
const PATH_SPACING = 1
const PATH_MIX = 2
const CURVE_STEPPED = 1
const CURVE_BEZIER = 2

export const LEGACY_TARGET_VERSION = '4.2.0'

export interface LegacyConversion {
  readonly json: Json
  readonly sourceVersion: string
  readonly warnings: readonly string[]
}

export class LegacyFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyFormatError'
  }
}

export function isSpine36(version: string | null): boolean {
  return version !== null && /^3\.6(\.|$)/.test(version)
}

function pick<T>(list: readonly T[], index: number, label: string): T {
  const value = list[index]
  if (value === undefined) throw new LegacyFormatError(`${label} 索引 ${index} 超出範圍`)
  return value
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

interface VertexBlock {
  readonly vertices: number[]
  readonly weighted: boolean
}

interface AttachmentRecord {
  readonly vertexLength: number
  readonly weighted: boolean
  readonly setupVertices: readonly number[]
}

class Spine36Reader {
  private readonly input: LegacyBinaryInput
  private readonly warnings: string[] = []
  private nonessential = false
  private bones: string[] = []
  private slots: string[] = []
  private ik: string[] = []
  private transforms: string[] = []
  private paths: Array<{ name: string; positionMode: string; spacingMode: string }> = []
  private skins: string[] = []
  private events: Array<{ name: string; stringValue: string | null }> = []
  private readonly attachmentIndex = new Map<string, AttachmentRecord>()

  constructor(bytes: Uint8Array) {
    this.input = new LegacyBinaryInput(bytes)
  }

  private str(): string | null {
    return this.input.readString()
  }

  private count(): number {
    return this.input.readVarInt(true)
  }

  read(): LegacyConversion {
    const input = this.input
    const hash = this.str()
    const version = this.str() ?? ''
    if (!isSpine36(version)) throw new LegacyFormatError(`不是 Spine 3.6 二進位檔（版本 ${version || '未知'}）`)
    const skeleton: Json = { hash: hash ?? '', spine: LEGACY_TARGET_VERSION, legacyVersion: version, width: round(input.readFloat()), height: round(input.readFloat()) }
    this.nonessential = input.readBoolean()
    if (this.nonessential) {
      skeleton.fps = round(input.readFloat())
      skeleton.images = this.str() ?? ''
    }
    const json: Json = { skeleton }
    json.bones = this.readBones()
    json.slots = this.readSlots()
    json.ik = this.readIk()
    json.transform = this.readTransforms()
    json.path = this.readPaths()
    const skins: Json[] = []
    const defaultSkin = this.readSkin('default')
    if (defaultSkin) skins.push(defaultSkin)
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `skin-${i}`
      const skin = this.readSkin(name)
      if (skin) skins.push(skin)
    }
    json.skins = skins
    json.events = this.readEvents()
    const animations: Json = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `animation-${i}`
      animations[name] = this.readAnimation(name)
    }
    json.animations = animations
    if (input.remaining > 0) this.warnings.push(`3.6 二進位結尾有 ${input.remaining} 位元組未解析`)
    return { json, sourceVersion: version, warnings: this.warnings }
  }

  private readBones(): Json[] {
    const input = this.input
    const result: Json[] = []
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `bone-${i}`
      const bone: Json = { name }
      if (i > 0) bone.parent = pick(this.bones, this.count(), '骨骼')
      bone.rotation = round(input.readFloat())
      bone.x = round(input.readFloat())
      bone.y = round(input.readFloat())
      bone.scaleX = round(input.readFloat())
      bone.scaleY = round(input.readFloat())
      bone.shearX = round(input.readFloat())
      bone.shearY = round(input.readFloat())
      bone.length = round(input.readFloat())
      bone.inherit = pick(TRANSFORM_MODES, this.count(), 'TransformMode')
      if (this.nonessential) bone.color = rgba8888(input.readInt32())
      this.bones.push(name)
      result.push(bone)
    }
    return result
  }

  private readSlots(): Json[] {
    const input = this.input
    const result: Json[] = []
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `slot-${i}`
      const slot: Json = { name, bone: pick(this.bones, this.count(), '骨骼') }
      slot.color = rgba8888(input.readInt32())
      const dark = input.readInt32()
      if (dark !== -1) slot.dark = rgb888(dark)
      const attachment = this.str()
      if (attachment !== null) slot.attachment = attachment
      slot.blend = pick(BLEND_MODES, this.count(), 'BlendMode')
      this.slots.push(name)
      result.push(slot)
    }
    return result
  }

  private boneList(): string[] {
    const bones: string[] = []
    for (let i = 0, n = this.count(); i < n; i++) bones.push(pick(this.bones, this.count(), '骨骼'))
    return bones
  }

  private readIk(): Json[] {
    const input = this.input
    const result: Json[] = []
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `ik-${i}`
      const order = this.count()
      const bones = this.boneList()
      const target = pick(this.bones, this.count(), '骨骼')
      const mix = round(input.readFloat())
      const bendPositive = input.readByte() > 0
      this.ik.push(name)
      result.push({ name, order, bones, target, mix, bendPositive })
    }
    return result
  }

  private readTransforms(): Json[] {
    const input = this.input
    const result: Json[] = []
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `transform-${i}`
      const order = this.count()
      const bones = this.boneList()
      const target = pick(this.bones, this.count(), '骨骼')
      const local = input.readBoolean()
      const relative = input.readBoolean()
      const rotation = round(input.readFloat())
      const x = round(input.readFloat())
      const y = round(input.readFloat())
      const scaleX = round(input.readFloat())
      const scaleY = round(input.readFloat())
      const shearY = round(input.readFloat())
      const rotateMix = round(input.readFloat())
      const translateMix = round(input.readFloat())
      const scaleMix = round(input.readFloat())
      const shearMix = round(input.readFloat())
      this.transforms.push(name)
      result.push({
        name,
        order,
        bones,
        target,
        local,
        relative,
        rotation,
        x,
        y,
        scaleX,
        scaleY,
        shearY,
        mixRotate: rotateMix,
        mixX: translateMix,
        mixY: translateMix,
        mixScaleX: scaleMix,
        mixScaleY: scaleMix,
        mixShearY: shearMix,
      })
    }
    return result
  }

  private readPaths(): Json[] {
    const input = this.input
    const result: Json[] = []
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `path-${i}`
      const order = this.count()
      const bones = this.boneList()
      const target = pick(this.slots, this.count(), '插槽')
      const positionMode = pick(POSITION_MODES, this.count(), 'PositionMode')
      const spacingMode = pick(SPACING_MODES, this.count(), 'SpacingMode')
      const rotateMode = pick(ROTATE_MODES, this.count(), 'RotateMode')
      const rotation = round(input.readFloat())
      const position = round(input.readFloat())
      const spacing = round(input.readFloat())
      const rotateMix = round(input.readFloat())
      const translateMix = round(input.readFloat())
      this.paths.push({ name, positionMode, spacingMode })
      result.push({ name, order, bones, target, positionMode, spacingMode, rotateMode, rotation, position, spacing, mixRotate: rotateMix, mixX: translateMix, mixY: translateMix })
    }
    return result
  }

  private readVertices(vertexCount: number): VertexBlock {
    const input = this.input
    if (!input.readBoolean()) {
      const vertices: number[] = []
      for (let i = 0; i < vertexCount * 2; i++) vertices.push(round(input.readFloat()))
      return { vertices, weighted: false }
    }
    const vertices: number[] = []
    for (let i = 0; i < vertexCount; i++) {
      const boneCount = this.count()
      vertices.push(boneCount)
      for (let b = 0; b < boneCount; b++) {
        vertices.push(this.count(), round(input.readFloat()), round(input.readFloat()), round(input.readFloat()))
      }
    }
    return { vertices, weighted: true }
  }

  private readShorts(): number[] {
    const values: number[] = []
    for (let i = 0, n = this.count(); i < n; i++) values.push(this.input.readShort())
    return values
  }

  private readSkin(skinName: string): Json | null {
    const slotCount = this.count()
    if (slotCount === 0) return null
    this.skins.push(skinName)
    const attachments: Record<string, Record<string, Json>> = {}
    for (let i = 0; i < slotCount; i++) {
      const slotName = pick(this.slots, this.count(), '插槽')
      const entries: Record<string, Json> = attachments[slotName] ?? {}
      for (let ii = 0, nn = this.count(); ii < nn; ii++) {
        const key = this.str() ?? `attachment-${ii}`
        entries[key] = this.readAttachment(skinName, slotName, key)
      }
      attachments[slotName] = entries
    }
    return { name: skinName, attachments }
  }

  private readAttachment(skinName: string, slotName: string, key: string): Json {
    const input = this.input
    const name = this.str()
    const type = pick(ATTACHMENT_TYPES, input.readByte(), 'AttachmentType')
    const json: Json = {}
    if (name !== null && name !== key) json.name = name
    const actual = name ?? key
    const record = (block: VertexBlock, vertexCount: number) =>
      this.attachmentIndex.set(`${skinName}\u0000${slotName}\u0000${key}`, { vertexLength: vertexCount * 2, weighted: block.weighted, setupVertices: block.weighted ? [] : block.vertices })
    switch (type) {
      case 'region': {
        const path = this.str()
        json.rotation = round(input.readFloat())
        json.x = round(input.readFloat())
        json.y = round(input.readFloat())
        json.scaleX = round(input.readFloat())
        json.scaleY = round(input.readFloat())
        json.width = round(input.readFloat())
        json.height = round(input.readFloat())
        json.color = rgba8888(input.readInt32())
        if (path !== null && path !== actual) json.path = path
        return json
      }
      case 'boundingbox': {
        const vertexCount = this.count()
        const block = this.readVertices(vertexCount)
        json.type = 'boundingbox'
        json.vertexCount = vertexCount
        json.vertices = block.vertices
        if (this.nonessential) json.color = rgba8888(input.readInt32())
        record(block, vertexCount)
        return json
      }
      case 'mesh': {
        const path = this.str()
        json.type = 'mesh'
        json.color = rgba8888(input.readInt32())
        const vertexCount = this.count()
        const uvs: number[] = []
        for (let i = 0; i < vertexCount * 2; i++) uvs.push(input.readFloat())
        json.uvs = uvs
        json.triangles = this.readShorts()
        const block = this.readVertices(vertexCount)
        json.vertices = block.vertices
        json.hull = this.count()
        if (this.nonessential) {
          json.edges = this.readShorts()
          json.width = round(input.readFloat())
          json.height = round(input.readFloat())
        }
        if (path !== null && path !== actual) json.path = path
        record(block, vertexCount)
        return json
      }
      case 'linkedmesh': {
        const path = this.str()
        json.type = 'linkedmesh'
        json.color = rgba8888(input.readInt32())
        const skin = this.str()
        if (skin !== null) json.skin = skin
        json.parent = this.str() ?? ''
        json.timelines = input.readBoolean()
        if (this.nonessential) {
          json.width = round(input.readFloat())
          json.height = round(input.readFloat())
        }
        if (path !== null && path !== actual) json.path = path
        return json
      }
      case 'path': {
        json.type = 'path'
        json.closed = input.readBoolean()
        json.constantSpeed = input.readBoolean()
        const vertexCount = this.count()
        const block = this.readVertices(vertexCount)
        json.vertexCount = vertexCount
        json.vertices = block.vertices
        const lengths: number[] = []
        for (let i = 0; i < Math.floor(vertexCount / 3); i++) lengths.push(round(input.readFloat()))
        json.lengths = lengths
        if (this.nonessential) json.color = rgba8888(input.readInt32())
        record(block, vertexCount)
        return json
      }
      case 'point': {
        json.type = 'point'
        json.rotation = round(input.readFloat())
        json.x = round(input.readFloat())
        json.y = round(input.readFloat())
        if (this.nonessential) json.color = rgba8888(input.readInt32())
        return json
      }
      default: {
        json.type = 'clipping'
        json.end = pick(this.slots, this.count(), '插槽')
        const vertexCount = this.count()
        const block = this.readVertices(vertexCount)
        json.vertexCount = vertexCount
        json.vertices = block.vertices
        if (this.nonessential) json.color = rgba8888(input.readInt32())
        record(block, vertexCount)
        return json
      }
    }
  }

  private readEvents(): Json {
    const input = this.input
    const events: Json = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = this.str() ?? `event-${i}`
      const intValue = input.readVarInt(false)
      const floatValue = round(input.readFloat())
      const stringValue = this.str()
      this.events.push({ name, stringValue })
      events[name] = { int: intValue, float: floatValue, string: stringValue ?? '' }
    }
    return events
  }

  private readCurve(): LegacyCurve {
    const type = this.input.readByte()
    if (type === CURVE_STEPPED) return 'stepped'
    if (type === CURVE_BEZIER) {
      const input = this.input
      return [input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat()]
    }
    return 'linear'
  }

  private readKeys(frameCount: number, readValues: () => number[]): LegacyKey[] {
    const keys: LegacyKey[] = []
    for (let frame = 0; frame < frameCount; frame++) {
      const time = this.input.readFloat()
      const values = readValues()
      const key: LegacyKey = { time, values, curve: 'linear' }
      if (frame < frameCount - 1) key.curve = this.readCurve()
      keys.push(key)
    }
    return keys
  }

  private floats(count: number): () => number[] {
    return () => {
      const values: number[] = []
      for (let i = 0; i < count; i++) values.push(this.input.readFloat())
      return values
    }
  }

  private readAnimation(animationName: string): Json {
    const input = this.input
    const animation: Json = {}
    const slots: Record<string, Json> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const slotName = pick(this.slots, this.count(), '插槽')
      const timelines: Json = slots[slotName] ?? {}
      for (let ii = 0, nn = this.count(); ii < nn; ii++) {
        const type = input.readByte()
        const frameCount = this.count()
        if (type === SLOT_ATTACHMENT) {
          const keys: Json[] = []
          for (let f = 0; f < frameCount; f++) keys.push({ time: round(input.readFloat()), name: this.str() })
          timelines.attachment = keys
        } else if (type === SLOT_COLOR) {
          const raw: number[] = []
          const keys = this.readKeys(frameCount, () => {
            const color = input.readInt32()
            raw.push(color)
            return rgbaChannels(color)
          })
          timelines.rgba = attachCurves(keys, (key, index) => ({ time: round(key.time), color: rgba8888(raw[index]) }))
        } else if (type === SLOT_TWO_COLOR) {
          const light: number[] = []
          const dark: number[] = []
          const keys = this.readKeys(frameCount, () => {
            const a = input.readInt32()
            const b = input.readInt32()
            light.push(a)
            dark.push(b)
            return [...rgbaChannels(a), ...rgbChannels(b)]
          })
          timelines.rgba2 = attachCurves(keys, (key, index) => {
            return { time: round(key.time), light: rgba8888(light[index]), dark: rgb888(dark[index]) }
          })
        } else {
          throw new LegacyFormatError(`動作 ${animationName} 含未知的插槽時間軸類型 ${type}`)
        }
      }
      slots[slotName] = timelines
    }
    if (Object.keys(slots).length > 0) animation.slots = slots
    const bones: Record<string, Json> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const boneName = pick(this.bones, this.count(), '骨骼')
      const timelines: Json = bones[boneName] ?? {}
      for (let ii = 0, nn = this.count(); ii < nn; ii++) {
        const type = input.readByte()
        const frameCount = this.count()
        if (type === BONE_ROTATE) {
          const raw = this.readKeys(frameCount, this.floats(1))
          const unwrapped = unwrapRotations(raw.map((key) => key.values[0]))
          const keys = raw.map((key, index) => ({ ...key, values: [unwrapped[index]] }))
          timelines.rotate = attachCurves(keys, (key) => ({ time: round(key.time), value: round(key.values[0]) }))
        } else if (type === BONE_TRANSLATE || type === BONE_SCALE || type === BONE_SHEAR) {
          const keys = this.readKeys(frameCount, this.floats(2))
          const name = type === BONE_TRANSLATE ? 'translate' : type === BONE_SCALE ? 'scale' : 'shear'
          timelines[name] = attachCurves(keys, (key) => ({ time: round(key.time), x: round(key.values[0]), y: round(key.values[1]) }))
        } else {
          throw new LegacyFormatError(`動作 ${animationName} 含未知的骨骼時間軸類型 ${type}`)
        }
      }
      bones[boneName] = timelines
    }
    if (Object.keys(bones).length > 0) animation.bones = bones
    const ik: Record<string, Json[]> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = pick(this.ik, this.count(), 'IK')
      const frameCount = this.count()
      const bends: number[] = []
      const keys = this.readKeys(frameCount, () => {
        const mix = input.readFloat()
        bends.push(input.readByte())
        return [mix, 0]
      })
      ik[name] = attachCurves(keys, (key, index) => ({ time: round(key.time), mix: round(key.values[0]), bendPositive: bends[index] > 0 }))
    }
    if (Object.keys(ik).length > 0) animation.ik = ik
    const transform: Record<string, Json[]> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const name = pick(this.transforms, this.count(), 'Transform')
      const frameCount = this.count()
      const keys = this.readKeys(frameCount, () => {
        const [rotate, translate, scale, shear] = this.floats(4)()
        return [rotate, translate, translate, scale, scale, shear]
      })
      transform[name] = attachCurves(keys, (key) => ({
        time: round(key.time),
        mixRotate: round(key.values[0]),
        mixX: round(key.values[1]),
        mixY: round(key.values[2]),
        mixScaleX: round(key.values[3]),
        mixScaleY: round(key.values[4]),
        mixShearY: round(key.values[5]),
      }))
    }
    if (Object.keys(transform).length > 0) animation.transform = transform
    const path: Record<string, Json> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const constraint = pick(this.paths, this.count(), 'Path')
      const timelines: Json = path[constraint.name] ?? {}
      for (let ii = 0, nn = this.count(); ii < nn; ii++) {
        const type = input.readByte()
        const frameCount = this.count()
        if (type === PATH_POSITION || type === PATH_SPACING) {
          const keys = this.readKeys(frameCount, this.floats(1))
          timelines[type === PATH_POSITION ? 'position' : 'spacing'] = attachCurves(keys, (key) => ({ time: round(key.time), value: round(key.values[0]) }))
        } else if (type === PATH_MIX) {
          const keys = this.readKeys(frameCount, () => {
            const [rotate, translate] = this.floats(2)()
            return [rotate, translate, translate]
          })
          timelines.mix = attachCurves(keys, (key) => ({ time: round(key.time), mixRotate: round(key.values[0]), mixX: round(key.values[1]), mixY: round(key.values[2]) }))
        } else {
          throw new LegacyFormatError(`動作 ${animationName} 含未知的路徑時間軸類型 ${type}`)
        }
      }
      path[constraint.name] = timelines
    }
    if (Object.keys(path).length > 0) animation.path = path
    const deform: Record<string, Record<string, Record<string, Json>>> = {}
    for (let i = 0, n = this.count(); i < n; i++) {
      const skinName = pick(this.skins, this.count(), '皮膚')
      for (let ii = 0, nn = this.count(); ii < nn; ii++) {
        const slotName = pick(this.slots, this.count(), '插槽')
        for (let iii = 0, nnn = this.count(); iii < nnn; iii++) {
          const attachmentName = this.str() ?? ''
          const record = this.attachmentIndex.get(`${skinName}\u0000${slotName}\u0000${attachmentName}`)
          if (!record) throw new LegacyFormatError(`動作 ${animationName} 的變形找不到部件 ${skinName}/${slotName}/${attachmentName}`)
          const frameCount = this.count()
          const offsets: Array<{ offset: number; vertices: number[] }> = []
          const keys = this.readKeys(frameCount, () => {
            const end = this.count()
            if (end === 0) {
              offsets.push({ offset: 0, vertices: [] })
              return [0, 1]
            }
            const start = this.count()
            const vertices: number[] = []
            for (let v = 0; v < end; v++) vertices.push(round(input.readFloat()))
            offsets.push({ offset: start, vertices })
            return [0, 1]
          })
          const timeline = keys.map((key, index) => {
            const entry: Json = { time: round(key.time) }
            const data = offsets[index]
            if (data.vertices.length > 0) {
              if (data.offset > 0) entry.offset = data.offset
              entry.vertices = data.vertices
            }
            const next = keys[index + 1]
            if (next && key.curve !== 'linear') {
              entry.curve = key.curve === 'stepped' ? 'stepped' : [round(key.time + key.curve[0] * (next.time - key.time)), round(key.curve[1]), round(key.time + key.curve[2] * (next.time - key.time)), round(key.curve[3])]
            }
            return entry
          })
          const bySkin = (deform[skinName] ??= {})
          const bySlot = (bySkin[slotName] ??= {})
          bySlot[attachmentName] = { deform: timeline }
        }
      }
    }
    if (Object.keys(deform).length > 0) animation.attachments = deform
    const drawOrderCount = this.count()
    if (drawOrderCount > 0) {
      const drawOrder: Json[] = []
      for (let i = 0; i < drawOrderCount; i++) {
        const time = round(input.readFloat())
        const offsets: Json[] = []
        for (let ii = 0, nn = this.count(); ii < nn; ii++) offsets.push({ slot: pick(this.slots, this.count(), '插槽'), offset: input.readVarInt(true) })
        drawOrder.push(offsets.length > 0 ? { time, offsets } : { time })
      }
      animation.drawOrder = drawOrder
    }
    const eventCount = this.count()
    if (eventCount > 0) {
      const events: Json[] = []
      for (let i = 0; i < eventCount; i++) {
        const time = round(input.readFloat())
        const data = pick(this.events, this.count(), '事件')
        const intValue = input.readVarInt(false)
        const floatValue = round(input.readFloat())
        const stringValue = input.readBoolean() ? this.str() : data.stringValue
        events.push({ time, name: data.name, int: intValue, float: floatValue, string: stringValue ?? '' })
      }
      animation.events = events
    }
    return animation
  }
}

export function convertSpine36Binary(bytes: Uint8Array): LegacyConversion {
  try {
    return new Spine36Reader(bytes).read()
  } catch (error) {
    if (error instanceof LegacyFormatError) throw error
    throw new LegacyFormatError(`Spine 3.6 二進位解析失敗：${error instanceof Error ? error.message : String(error)}`)
  }
}

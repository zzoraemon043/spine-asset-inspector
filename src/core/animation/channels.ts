import { isObject, type JsonObject, type JsonValue } from '../editor/json'

export type Curve = 'linear' | 'stepped' | readonly number[]
export type ChannelGroup = 'bones' | 'slots' | 'events' | 'ik' | 'transform' | 'drawOrder' | 'attachments'

export interface Key {
  readonly time: number
  readonly values: readonly number[]
  readonly curve: Curve
  readonly extra: JsonObject
  readonly raw: JsonObject | null
}

export interface FieldSpec {
  readonly name: string
  readonly kind: 'number' | 'color'
  readonly size: number
  readonly defaults: readonly number[]
  readonly always?: boolean
}

export interface ChannelSpec {
  readonly name: string
  readonly label: string
  readonly group: ChannelGroup
  readonly fields: readonly FieldSpec[]
  readonly curved: boolean
  readonly unique: boolean
  readonly progress?: boolean
}

const number = (name: string, value = 0): FieldSpec => ({ name, kind: 'number', size: 1, defaults: [value] })
const color = (name: string, size: 3 | 4): FieldSpec => ({ name, kind: 'color', size, defaults: Array.from({ length: size }, () => 1) })

const mix = (name: string): FieldSpec => ({ name, kind: 'number', size: 1, defaults: [1], always: true })

function spec(name: string, label: string, group: ChannelGroup, fields: readonly FieldSpec[], curved = true, unique = true, progress = false): ChannelSpec {
  return { name, label, group, fields, curved, unique, progress }
}

const SPECS: readonly ChannelSpec[] = [
  spec('translate', '位移', 'bones', [number('x'), number('y')]),
  spec('rotate', '旋轉', 'bones', [number('value')]),
  spec('scale', '縮放', 'bones', [number('x', 1), number('y', 1)]),
  spec('shear', '斜切', 'bones', [number('x'), number('y')]),
  spec('translatex', '位移 X', 'bones', [number('value')]),
  spec('translatey', '位移 Y', 'bones', [number('value')]),
  spec('scalex', '縮放 X', 'bones', [number('value', 1)]),
  spec('scaley', '縮放 Y', 'bones', [number('value', 1)]),
  spec('shearx', '斜切 X', 'bones', [number('value')]),
  spec('sheary', '斜切 Y', 'bones', [number('value')]),
  spec('inherit', '繼承', 'bones', [], false),
  spec('attachment', '部件', 'slots', [], false),
  spec('rgba', '顏色', 'slots', [color('color', 4)]),
  spec('rgb', '顏色 RGB', 'slots', [color('color', 3)]),
  spec('alpha', '透明度', 'slots', [number('value')]),
  spec('rgba2', '雙色', 'slots', [color('light', 4), color('dark', 3)]),
  spec('rgb2', '雙色 RGB', 'slots', [color('light', 3), color('dark', 3)]),
  spec('event', '事件', 'events', [], false, false),
  spec('ik', 'IK', 'ik', [number('mix', 1), number('softness')]),
  spec('transform', '變換', 'transform', [mix('mixRotate'), mix('mixX'), mix('mixY'), mix('mixScaleX'), mix('mixScaleY'), mix('mixShearY')]),
  spec('drawOrder', '繪製順序', 'drawOrder', [], false),
  spec('deform', '變形', 'attachments', [], true, true, true),
]

export const BONE_CHANNELS: readonly string[] = SPECS.filter((item) => item.group === 'bones').map((item) => item.name)
export const SLOT_CHANNELS: readonly string[] = SPECS.filter((item) => item.group === 'slots').map((item) => item.name)
export const EVENT_CHANNEL = 'event'
export const EVENTS_TARGET = 'events'
export const DRAW_ORDER_CHANNEL = 'drawOrder'
export const DRAW_ORDER_TARGET = 'draworder'
export const DEFORM_CHANNEL = 'deform'
export const DEFORM_SEPARATOR = '|'
export const KEYABLE_CHANNELS = ['translate', 'rotate', 'scale'] as const
export type KeyableChannel = (typeof KEYABLE_CHANNELS)[number]
export const TIME_EPSILON = 1e-4

export function channelSpec(name: string): ChannelSpec {
  return SPECS.find((item) => item.name === name) ?? spec(name, name, 'bones', [], false)
}

export function isKnownChannel(name: string): boolean {
  return SPECS.some((item) => item.name === name)
}

export function isBoneChannel(name: string): boolean {
  return BONE_CHANNELS.includes(name)
}

export function valueCount(channel: string): number {
  return channelSpec(channel).fields.reduce((sum, field) => sum + field.size, 0)
}

export function curveChannels(channel: string): number {
  return channelSpec(channel).progress ? 1 : valueCount(channel)
}

export function deformTarget(skin: string, slot: string, attachment: string): string {
  return [skin, slot, attachment].join(DEFORM_SEPARATOR)
}

export function parseDeformTarget(target: string): { skin: string; slot: string; attachment: string } | null {
  const parts = target.split(DEFORM_SEPARATOR)
  return parts.length === 3 && parts.every((part) => part.length > 0) ? { skin: parts[0], slot: parts[1], attachment: parts[2] } : null
}

export function roundTime(time: number): number {
  const value = Math.round(time * 1e6) / 1e6
  return Object.is(value, -0) ? 0 : value
}

export function roundValue(value: number): number {
  const result = Math.round(value * 1e4) / 1e4
  return Object.is(result, -0) ? 0 : result
}

export function parseColor(text: unknown, size: number): number[] | null {
  if (typeof text !== 'string') return null
  const hex = text.trim().replace(/^#/, '')
  if (hex.length < size * 2 || !/^[0-9a-fA-F]+$/.test(hex)) return null
  return Array.from({ length: size }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255)
}

export function formatColor(values: readonly number[]): string {
  return values.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0')).join('')
}

function parseCurve(value: JsonValue | undefined): Curve {
  if (value === 'stepped') return 'stepped'
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) return value as number[]
  return 'linear'
}

export function parseKeys(channel: string, value: JsonValue | undefined): Key[] {
  if (!Array.isArray(value)) return []
  const current = channelSpec(channel)
  const names = current.fields.map((field) => field.name)
  return value.filter(isObject).map((item) => {
    const extra: JsonObject = {}
    for (const [field, entry] of Object.entries(item)) if (field !== 'time' && field !== 'curve' && !names.includes(field)) extra[field] = entry
    const values: number[] = []
    for (const field of current.fields) {
      const entry = item[field.name]
      if (field.kind === 'color') values.push(...(parseColor(entry, field.size) ?? field.defaults))
      else values.push(typeof entry === 'number' ? entry : field.defaults[0])
    }
    return { time: typeof item.time === 'number' ? item.time : 0, values, curve: current.curved ? parseCurve(item.curve) : 'linear', extra, raw: item }
  })
}

export function serializeKey(channel: string, key: Key): JsonObject {
  if (key.raw) return key.raw
  const current = channelSpec(channel)
  const result: JsonObject = {}
  if (key.time !== 0) result.time = key.time
  let offset = 0
  for (const field of current.fields) {
    const slice = key.values.slice(offset, offset + field.size)
    offset += field.size
    if (field.kind === 'color') result[field.name] = formatColor(slice)
    else if (field.always || slice[0] !== field.defaults[0]) result[field.name] = slice[0]
  }
  const ordered: JsonObject = { ...result, ...key.extra }
  if (key.curve === 'stepped') ordered.curve = 'stepped'
  else if (key.curve !== 'linear') ordered.curve = [...key.curve]
  return ordered
}

export function serializeKeys(channel: string, keys: readonly Key[]): JsonValue[] {
  return keys.map((key) => serializeKey(channel, key))
}

export function createKey(time: number, values: readonly number[], extra: JsonObject = {}): Key {
  return { time: roundTime(time), values: values.map(roundValue), curve: 'linear', extra, raw: null }
}

export function curveKindOf(curve: Curve): 'linear' | 'stepped' | 'bezier' {
  return curve === 'linear' ? 'linear' : curve === 'stepped' ? 'stepped' : 'bezier'
}

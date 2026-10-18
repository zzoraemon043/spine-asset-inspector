export const DEMO_NAME = 'inspector-demo'
export const DEMO_SPINE_VERSION = '4.2.120'

type Json = Record<string, unknown>

interface BoneSpec {
  readonly name: string
  readonly parent?: string
  readonly x?: number
  readonly y?: number
  readonly rotation?: number
  readonly length?: number
  readonly color?: string
}

const BONES: readonly BoneSpec[] = [
  { name: 'root' },
  { name: 'hip', parent: 'root', y: 140, color: 'f59e0bff' },
  { name: 'torso', parent: 'hip', rotation: 90, length: 90 },
  { name: 'head', parent: 'torso', x: 92, length: 60 },
  { name: 'cape', parent: 'torso', x: 80, y: 10, rotation: 180, length: 55 },
  { name: 'cape-tip', parent: 'cape', x: 55, length: 50 },
  { name: 'arm-back-upper', parent: 'torso', x: 80, y: 6, rotation: 180, length: 52 },
  { name: 'arm-back-lower', parent: 'arm-back-upper', x: 52, length: 48 },
  { name: 'arm-front-upper', parent: 'torso', x: 80, y: -6, rotation: 180, length: 52 },
  { name: 'arm-front-lower', parent: 'arm-front-upper', x: 52, length: 48 },
  { name: 'hand', parent: 'arm-front-lower', x: 50, length: 14 },
  { name: 'weapon', parent: 'hand', x: 6, rotation: 90, length: 100, color: '10b981ff' },
  { name: 'leg-back-upper', parent: 'hip', x: -6, rotation: -90, length: 68 },
  { name: 'leg-back-lower', parent: 'leg-back-upper', x: 68, length: 64 },
  { name: 'foot-back', parent: 'leg-back-lower', x: 64, rotation: 90, length: 30 },
  { name: 'leg-front-upper', parent: 'hip', x: 6, rotation: -90, length: 68 },
  { name: 'leg-front-lower', parent: 'leg-front-upper', x: 68, length: 64 },
  { name: 'foot-front', parent: 'leg-front-lower', x: 64, rotation: 90, length: 30 },
]

const SLOTS: ReadonlyArray<readonly [string, string, string | null]> = [
  ['arm-back-upper', 'arm-back-upper', 'arm-upper-back'],
  ['arm-back-lower', 'arm-back-lower', 'arm-lower-back'],
  ['leg-back-upper', 'leg-back-upper', 'leg-upper-back'],
  ['leg-back-lower', 'leg-back-lower', 'leg-lower-back'],
  ['foot-back', 'foot-back', 'foot-back'],
  ['cape', 'cape', 'cape'],
  ['leg-front-upper', 'leg-front-upper', 'leg-upper'],
  ['leg-front-lower', 'leg-front-lower', 'leg-lower'],
  ['foot-front', 'foot-front', 'foot'],
  ['torso', 'torso', 'torso'],
  ['armor', 'torso', 'armor'],
  ['head', 'head', 'head'],
  ['helmet', 'head', 'helmet'],
  ['arm-front-upper', 'arm-front-upper', 'arm-upper'],
  ['arm-front-lower', 'arm-front-lower', 'arm-lower'],
  ['weapon', 'weapon', 'weapon'],
  ['hand', 'hand', 'hand'],
  ['hitbox', 'hip', 'hitbox'],
]

function region(name: string, x: number, width: number, height: number, path?: string, y = 0): Json {
  const result: Json = { x, y, width, height }
  if (path) result.path = path
  return { [name]: result }
}

function capeMesh(boneIndex: (name: string) => number): Json {
  const cape = boneIndex('cape')
  const tip = boneIndex('cape-tip')
  const rows: ReadonlyArray<readonly [number, number]> = [
    [0, -18],
    [50, -24],
    [100, -30],
    [100, 30],
    [50, 24],
    [0, 18],
  ]
  const vertices: number[] = []
  const uvs: number[] = []
  for (const [x, y] of rows) {
    if (x === 0) vertices.push(1, cape, x, y, 1)
    else if (x === 50) vertices.push(2, cape, x, y, 0.5, tip, x - 55, y, 0.5)
    else vertices.push(1, tip, x - 55, y, 1)
    uvs.push(x / 100, (30 - y) / 60)
  }
  return {
    cape: {
      type: 'mesh',
      uvs,
      triangles: [0, 1, 5, 1, 4, 5, 1, 2, 4, 2, 3, 4],
      vertices,
      hull: 6,
      width: 100,
      height: 60,
    },
  }
}

type Key = Json

function rotate(...keys: ReadonlyArray<readonly [number, number]>): { rotate: Key[] } {
  return { rotate: keys.map(([time, value]) => ({ time, value })) }
}

function translate(...keys: ReadonlyArray<readonly [number, number, number]>): { translate: Key[] } {
  return { translate: keys.map(([time, x, y]) => ({ time, x, y })) }
}

function merge(...parts: Json[]): Json {
  return Object.assign({}, ...parts)
}

function animations(): Json {
  return {
    idle: {
      bones: {
        hip: translate([0, 0, 0], [0.6, 0, -3], [1.2, 0, 0]),
        torso: rotate([0, 0], [0.6, 2], [1.2, 0]),
        head: rotate([0, 0], [0.6, -3], [1.2, 0]),
        'arm-front-upper': rotate([0, 0], [0.6, 4], [1.2, 0]),
        'arm-back-upper': rotate([0, 0], [0.6, -4], [1.2, 0]),
        cape: rotate([0, 0], [0.6, 6], [1.2, 0]),
        'cape-tip': rotate([0, 0], [0.6, 8], [1.2, 0]),
      },
    },
    walk: {
      bones: {
        hip: translate([0, 0, 0], [0.25, 0, 6], [0.5, 0, 0], [0.75, 0, 6], [1, 0, 0]),
        torso: rotate([0, -4], [0.5, -4], [1, -4]),
        'leg-front-upper': rotate([0, 25], [0.5, -25], [1, 25]),
        'leg-front-lower': rotate([0, 0], [0.25, 30], [0.5, 0], [0.75, 5], [1, 0]),
        'leg-back-upper': rotate([0, -25], [0.5, 25], [1, -25]),
        'leg-back-lower': rotate([0, 5], [0.25, 0], [0.5, 0], [0.75, 30], [1, 5]),
        'arm-front-upper': rotate([0, -20], [0.5, 20], [1, -20]),
        'arm-back-upper': rotate([0, 20], [0.5, -20], [1, 20]),
        cape: rotate([0, 10], [0.5, 16], [1, 10]),
      },
      events: [
        { time: 0, name: 'step', int: 1, string: 'left' },
        { time: 0.5, name: 'step', int: 2, string: 'right' },
      ],
    },
    run: {
      bones: {
        hip: translate([0, 0, 0], [0.15, 0, 10], [0.3, 0, 0], [0.45, 0, 10], [0.6, 0, 0]),
        torso: rotate([0, -12], [0.3, -10], [0.6, -12]),
        'leg-front-upper': rotate([0, 45], [0.3, -40], [0.6, 45]),
        'leg-front-lower': rotate([0, 10], [0.15, 70], [0.3, 0], [0.45, 20], [0.6, 10]),
        'leg-back-upper': rotate([0, -40], [0.3, 45], [0.6, -40]),
        'leg-back-lower': rotate([0, 0], [0.15, 20], [0.3, 10], [0.45, 70], [0.6, 0]),
        'arm-front-upper': rotate([0, -40], [0.3, 40], [0.6, -40]),
        'arm-front-lower': rotate([0, 70], [0.6, 70]),
        'arm-back-upper': rotate([0, 40], [0.3, -40], [0.6, 40]),
        'arm-back-lower': rotate([0, 70], [0.6, 70]),
        cape: rotate([0, 35], [0.3, 45], [0.6, 35]),
        'cape-tip': rotate([0, 10], [0.3, 25], [0.6, 10]),
      },
      events: [
        { time: 0, name: 'step', int: 1, float: 0.8, string: 'left' },
        { time: 0.3, name: 'step', int: 2, float: 0.8, string: 'right' },
      ],
    },
    attack: {
      bones: {
        hip: translate([0, 0, 0], [0.4, 10, 0], [0.8, 0, 0]),
        torso: rotate([0, 0], [0.25, 8], [0.4, -12], [0.8, 0]),
        'arm-front-upper': rotate([0, 0], [0.25, -150], [0.4, 60], [0.6, 40], [0.8, 0]),
        'arm-front-lower': rotate([0, 0], [0.25, -20], [0.4, 10], [0.8, 0]),
        weapon: rotate([0, 0], [0.4, -20], [0.8, 0]),
      },
      events: [
        { time: 0.3, name: 'fx', string: 'swing_trail' },
        { time: 0.4, name: 'hit', int: 25, float: 1.5, string: 'slash' },
      ],
    },
    shoot: {
      bones: {
        'arm-front-upper': rotate([0, 80], [0.1, 95], [0.5, 80]),
        'arm-front-lower': rotate([0, 0], [0.1, -10], [0.5, 0]),
        weapon: rotate([0, 0], [0.1, 15], [0.5, 0]),
      },
      events: [{ time: 0.05, name: 'fx', string: 'muzzle_flash' }],
    },
    hit: {
      bones: {
        hip: translate([0, 0, 0], [0.08, -12, 0], [0.4, 0, 0]),
        torso: rotate([0, 0], [0.08, 14], [0.4, 0]),
        head: rotate([0, 0], [0.08, 10], [0.4, 0]),
      },
      slots: {
        torso: { rgba: [{ time: 0, color: 'ff5555ff' }, { time: 0.2, color: 'ffffffff' }] },
        head: { rgba: [{ time: 0, color: 'ff7777ff' }, { time: 0.2, color: 'ffffffff' }] },
      },
      events: [{ time: 0.02, name: 'fx', string: 'impact', float: 0.6 }],
    },
    death: {
      bones: {
        hip: merge(translate([0, 0, 0], [0.5, -20, -40], [1, -40, -110]), rotate([0, 0], [0.5, 20], [1, 85])),
        torso: rotate([0, 0], [0.5, 10], [1, 0]),
        head: rotate([0, 0], [0.6, 20], [1, -10]),
        'arm-front-upper': rotate([0, 0], [0.3, -60], [0.7, 40], [1, 10]),
        'arm-back-upper': rotate([0, 0], [0.3, 50], [0.7, -30], [1, -10]),
        'leg-front-upper': rotate([0, 0], [0.5, 30], [1, 10]),
        'leg-back-upper': rotate([0, 0], [0.5, -20], [1, 5]),
      },
      slots: {
        helmet: { attachment: [{ time: 0, name: 'helmet' }, { time: 0.6, name: null }] },
      },
      events: [
        { time: 0.6, name: 'fx', string: 'helmet_drop' },
        { time: 1, name: 'fx', string: 'dust', float: 2 },
      ],
    },
  }
}

export function createDemoSkeletonJson(): Json {
  const boneNames = BONES.map((bone) => bone.name)
  const boneIndex = (name: string) => {
    const index = boneNames.indexOf(name)
    if (index < 0) throw new Error(`未知骨骼：${name}`)
    return index
  }
  const defaultAttachments: Record<string, Json> = {
    'arm-back-upper': region('arm-upper-back', 26, 58, 22),
    'arm-back-lower': region('arm-lower-back', 24, 54, 20),
    'leg-back-upper': region('leg-upper-back', 34, 74, 28),
    'leg-back-lower': region('leg-lower-back', 32, 68, 24),
    'foot-back': region('foot-back', 12, 38, 18),
    cape: capeMesh(boneIndex),
    'leg-front-upper': region('leg-upper', 34, 74, 28),
    'leg-front-lower': region('leg-lower', 32, 68, 24),
    'foot-front': region('foot', 12, 38, 18),
    torso: region('torso', 45, 96, 64),
    head: region('head', 28, 64, 64),
    'arm-front-upper': region('arm-upper', 26, 58, 22),
    'arm-front-lower': region('arm-lower', 24, 54, 20),
    hand: region('hand', 7, 22, 22),
    hitbox: {
      hitbox: { type: 'boundingbox', vertexCount: 4, vertices: [-40, -140, 40, -140, 40, 125, -40, 125], color: 'ff3d6eff' },
    },
  }
  return {
    skeleton: {
      hash: 'inspector-demo-0001',
      spine: DEMO_SPINE_VERSION,
      x: -120,
      y: 0,
      width: 240,
      height: 330,
      fps: 30,
      images: './',
      audio: '',
    },
    bones: BONES.map((bone) => {
      const json: Json = { name: bone.name }
      if (bone.parent) json.parent = bone.parent
      if (bone.length) json.length = bone.length
      if (bone.x) json.x = bone.x
      if (bone.y) json.y = bone.y
      if (bone.rotation) json.rotation = bone.rotation
      if (bone.color) json.color = bone.color
      return json
    }),
    slots: SLOTS.map(([name, bone, attachment]) => {
      const json: Json = { name, bone }
      if (attachment) json.attachment = attachment
      return json
    }),
    skins: [
      { name: 'default', attachments: defaultAttachments },
      { name: 'armor/red', attachments: { armor: region('armor', 48, 84, 70, 'armor-red') } },
      { name: 'armor/blue', attachments: { armor: region('armor', 48, 84, 70, 'armor-blue') } },
      { name: 'helmet/knight', attachments: { helmet: region('helmet', 48, 46, 72, 'helmet-knight') } },
      { name: 'helmet/cap', attachments: { helmet: region('helmet', 54, 30, 70, 'helmet-cap') } },
      { name: 'weapon/sword', attachments: { weapon: region('weapon', 40, 110, 16, 'sword') } },
      { name: 'weapon/blaster', attachments: { weapon: region('weapon', 22, 70, 26, 'blaster') } },
    ],
    events: {
      step: { int: 0, string: 'stone' },
      hit: { int: 0, float: 0, string: '' },
      fx: { string: '' },
    },
    animations: animations(),
  }
}

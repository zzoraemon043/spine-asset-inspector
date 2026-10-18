import { MeshAttachment, type Skeleton, type Slot } from '@esotericsoftware/spine-core'
import type { JsonObject } from '../editor/json'
import type { Vec } from '../gizmo/types'

export function deformLength(attachment: MeshAttachment): number {
  return attachment.bones ? (attachment.vertices.length / 3) * 2 : attachment.vertices.length
}

export function vertexCount(attachment: MeshAttachment): number {
  return attachment.worldVerticesLength / 2
}

export function worldVertices(slot: Slot, attachment: MeshAttachment): number[] {
  const out = new Array<number>(attachment.worldVerticesLength).fill(0)
  attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, out, 0, 2)
  return out
}

function invert(a: number, b: number, c: number, d: number, dx: number, dy: number): [number, number] {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) return [dx, dy]
  return [(d * dx - b * dy) / det, (a * dy - c * dx) / det]
}

export function offsetDeform(skeleton: Skeleton, slot: Slot, attachment: MeshAttachment, base: readonly number[], vertices: readonly number[], delta: Vec): number[] {
  const length = deformLength(attachment)
  const result = Array.from({ length }, (_, index) => base[index] ?? 0)
  const chosen = new Set(vertices)
  const bones = attachment.bones
  if (!bones) {
    const bone = slot.bone
    const [lx, ly] = invert(bone.a, bone.b, bone.c, bone.d, delta.x, delta.y)
    for (const vertex of chosen) {
      if (vertex * 2 + 1 >= length) continue
      result[vertex * 2] += lx
      result[vertex * 2 + 1] += ly
    }
    return result
  }
  let cursor = 0
  let influence = 0
  for (let vertex = 0; cursor < bones.length; vertex += 1) {
    const count = bones[cursor++]
    for (let entry = 0; entry < count; entry += 1, influence += 1) {
      const bone = skeleton.bones[bones[cursor++]]
      if (!chosen.has(vertex)) continue
      const [lx, ly] = invert(bone.a, bone.b, bone.c, bone.d, delta.x, delta.y)
      result[influence * 2] += lx
      result[influence * 2 + 1] += ly
    }
  }
  return result
}

function round(value: number): number {
  const result = Math.round(value * 1e4) / 1e4
  return Object.is(result, -0) ? 0 : result
}

export function deformExtra(offsets: readonly number[]): JsonObject {
  const rounded = offsets.map(round)
  const first = rounded.findIndex((value) => value !== 0)
  if (first < 0) return {}
  let last = rounded.length - 1
  while (last > first && rounded[last] === 0) last -= 1
  return first > 0 ? { offset: first, vertices: rounded.slice(first, last + 1) } : { vertices: rounded.slice(0, last + 1) }
}

export function denseDeform(extra: JsonObject, length: number): number[] {
  const result = new Array<number>(length).fill(0)
  const offset = typeof extra.offset === 'number' ? extra.offset : 0
  const vertices = Array.isArray(extra.vertices) ? extra.vertices : []
  vertices.forEach((value, index) => {
    if (typeof value === 'number' && offset + index < length) result[offset + index] = value
  })
  return result
}

export function pickVertex(world: readonly number[], point: Vec, tolerance: number): number | null {
  let best: number | null = null
  let bestDistance = tolerance
  for (let index = 0; index * 2 + 1 < world.length; index += 1) {
    const distance = Math.hypot(world[index * 2] - point.x, world[index * 2 + 1] - point.y)
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

export function isMesh(value: unknown): value is MeshAttachment {
  return value instanceof MeshAttachment
}

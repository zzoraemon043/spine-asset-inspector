import type { Skeleton } from '@esotericsoftware/spine-core'
import type { BoneSegment } from './pick'
import type { Affine, BonePose, SetupField, SetupPatch } from './types'

export function rootFrame(skeleton: Skeleton): Affine {
  return { a: skeleton.scaleX, b: 0, c: 0, d: skeleton.scaleY, x: skeleton.x, y: skeleton.y }
}

export type PoseBase = 'setup' | 'pose'

export function bonePose(skeleton: Skeleton, name: string, base: PoseBase = 'setup'): BonePose | null {
  const bone = skeleton.findBone(name)
  if (!bone || !bone.active) return null
  const parent = bone.parent
  return {
    name,
    world: { a: bone.a, b: bone.b, c: bone.c, d: bone.d, x: bone.worldX, y: bone.worldY },
    parent: parent ? { a: parent.a, b: parent.b, c: parent.c, d: parent.d, x: parent.worldX, y: parent.worldY } : rootFrame(skeleton),
    length: bone.data.length,
    setup:
      base === 'pose'
        ? { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY }
        : { x: bone.data.x, y: bone.data.y, rotation: bone.data.rotation, scaleX: bone.data.scaleX, scaleY: bone.data.scaleY },
  }
}

export function boneSegments(skeleton: Skeleton): BoneSegment[] {
  return skeleton.bones
    .filter((bone) => bone.active)
    .map((bone) => ({
      name: bone.data.name,
      origin: { x: bone.worldX, y: bone.worldY },
      tip: { x: bone.worldX + bone.a * bone.data.length, y: bone.worldY + bone.c * bone.data.length },
    }))
}

export function applySetup(skeleton: Skeleton, name: string, values: SetupPatch): boolean {
  const bone = skeleton.findBone(name)
  if (!bone) return false
  for (const field of Object.keys(values) as SetupField[]) {
    const value = values[field]
    if (value !== undefined) bone.data[field] = value
  }
  bone.setToSetupPose()
  return true
}

import type { Skeleton } from '@esotericsoftware/spine-core'

export function transferPose(source: Skeleton, target: Skeleton): void {
  target.x = source.x
  target.y = source.y
  target.scaleX = source.scaleX
  target.scaleY = source.scaleY
  const boneCount = Math.min(source.bones.length, target.bones.length)
  for (let i = 0; i < boneCount; i++) {
    const from = source.bones[i]
    const to = target.bones[i]
    to.x = from.x
    to.y = from.y
    to.rotation = from.rotation
    to.scaleX = from.scaleX
    to.scaleY = from.scaleY
    to.shearX = from.shearX
    to.shearY = from.shearY
    to.a = from.a
    to.b = from.b
    to.c = from.c
    to.d = from.d
    to.worldX = from.worldX
    to.worldY = from.worldY
    to.active = from.active
  }
  const slotCount = Math.min(source.slots.length, target.slots.length)
  for (let i = 0; i < slotCount; i++) {
    const from = source.slots[i]
    const to = target.slots[i]
    to.color.setFromColor(from.color)
    if (from.darkColor && to.darkColor) to.darkColor.setFromColor(from.darkColor)
    const name = from.getAttachment()?.name ?? null
    to.setAttachment(name === null ? null : target.getAttachment(i, name))
    to.sequenceIndex = from.sequenceIndex
    to.deform = from.deform.slice()
  }
  target.drawOrder = source.drawOrder.map((slot) => target.slots[slot.data.index])
}

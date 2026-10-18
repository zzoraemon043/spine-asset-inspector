import { MeshAttachment, RegionAttachment, type Skeleton } from '@esotericsoftware/spine-core'
import type { Bounds } from '../types'

interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const scratch: number[] = []

export function attachmentBoxes(skeleton: Skeleton): Box[] {
  const boxes: Box[] = []
  for (const slot of skeleton.drawOrder) {
    if (!slot.bone.active || slot.color.a === 0) continue
    const attachment = slot.getAttachment()
    let count = 0
    if (attachment instanceof RegionAttachment) {
      scratch.length = 8
      attachment.computeWorldVertices(slot, scratch, 0, 2)
      count = 8
    } else if (attachment instanceof MeshAttachment) {
      count = attachment.worldVerticesLength
      scratch.length = count
      attachment.computeWorldVertices(slot, 0, count, scratch, 0, 2)
    } else {
      continue
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < count; i += 2) {
      minX = Math.min(minX, scratch[i])
      maxX = Math.max(maxX, scratch[i])
      minY = Math.min(minY, scratch[i + 1])
      maxY = Math.max(maxY, scratch[i + 1])
    }
    if (Number.isFinite(minX) && Number.isFinite(minY)) boxes.push({ minX, minY, maxX, maxY })
  }
  return boxes
}

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

export function focusBounds(boxes: readonly Box[], fallback: Bounds): Bounds {
  if (boxes.length < 4) return fallback
  const centersX = boxes.map((box) => (box.minX + box.maxX) / 2).sort((a, b) => a - b)
  const centersY = boxes.map((box) => (box.minY + box.maxY) / 2).sort((a, b) => a - b)
  const sizes = boxes.map((box) => Math.max(box.maxX - box.minX, box.maxY - box.minY)).sort((a, b) => a - b)
  const size = quantile(sizes, 0.5) * 1.5
  const spanX = quantile(centersX, 0.9) - quantile(centersX, 0.1)
  const spanY = quantile(centersY, 0.9) - quantile(centersY, 0.1)
  const marginX = Math.max(size, spanX * 0.5)
  const marginY = Math.max(size, spanY * 0.5)
  const lowX = quantile(centersX, 0.1) - marginX
  const highX = quantile(centersX, 0.9) + marginX
  const lowY = quantile(centersY, 0.1) - marginY
  const highY = quantile(centersY, 0.9) + marginY
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    if (cx < lowX || cx > highX || cy < lowY || cy > highY) continue
    minX = Math.min(minX, box.minX)
    minY = Math.min(minY, box.minY)
    maxX = Math.max(maxX, box.maxX)
    maxY = Math.max(maxY, box.maxY)
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return fallback
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

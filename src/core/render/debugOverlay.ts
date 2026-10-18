import {
  Color,
  RegionAttachment,
  VertexAttachment,
  type Skeleton,
  type Slot,
} from '@esotericsoftware/spine-webgl'
import type { SceneRenderer } from '@esotericsoftware/spine-webgl'
import type { DebugFlags } from '../types'

const SLOT_COLOR = new Color(0.98, 0.75, 0.14, 1)
const HIGHLIGHT_COLOR = new Color(0.13, 0.83, 0.93, 1)
const AXIS_COLOR = new Color(1, 1, 1, 0.12)
const ORIGIN_COLOR = new Color(1, 1, 1, 0.35)

const scratch: number[] = []

export function attachmentOutline(slot: Slot): number[] | null {
  const attachment = slot.getAttachment()
  if (!attachment) return null
  if (attachment instanceof RegionAttachment) {
    scratch.length = 8
    attachment.computeWorldVertices(slot, scratch, 0, 2)
    return scratch.slice(0, 8)
  }
  if (attachment instanceof VertexAttachment) {
    const length = attachment.worldVerticesLength
    if (length < 4) return null
    scratch.length = length
    attachment.computeWorldVertices(slot, 0, length, scratch, 0, 2)
    const hull = 'hullLength' in attachment && typeof attachment.hullLength === 'number' && attachment.hullLength > 0 ? attachment.hullLength : length
    return scratch.slice(0, hull)
  }
  return null
}

function drawOutline(scene: SceneRenderer, vertices: number[], color: Color, width: number): void {
  const count = vertices.length / 2
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    scene.rectLine(true, vertices[i * 2], vertices[i * 2 + 1], vertices[j * 2], vertices[j * 2 + 1], width, color)
  }
}

export interface OverlayOptions {
  readonly debug: DebugFlags
  readonly highlightSlot: string | null
  readonly showAxes: boolean
  readonly pixelSize: number
  readonly worldExtent: number
}

export function configureDebugRenderer(scene: SceneRenderer, debug: DebugFlags, pixelSize: number): boolean {
  const renderer = scene.skeletonDebugRenderer
  renderer.drawBones = debug.bones
  renderer.drawRegionAttachments = debug.regions
  renderer.drawBoundingBoxes = debug.boundingBoxes
  renderer.drawMeshHull = debug.meshHull
  renderer.drawMeshTriangles = debug.meshTriangles
  renderer.drawPaths = debug.paths
  renderer.drawClipping = debug.clipping
  renderer.drawSkeletonXY = false
  renderer.scale = pixelSize
  return debug.bones || debug.regions || debug.boundingBoxes || debug.meshHull || debug.meshTriangles || debug.paths || debug.clipping
}

export function drawAxes(scene: SceneRenderer, pixelSize: number, extent: number): void {
  scene.line(-extent, 0, extent, 0, AXIS_COLOR)
  scene.line(0, -extent, 0, extent, AXIS_COLOR)
  const tick = pixelSize * 8
  scene.rectLine(true, -tick, 0, tick, 0, pixelSize * 1.5, ORIGIN_COLOR)
  scene.rectLine(true, 0, -tick, 0, tick, pixelSize * 1.5, ORIGIN_COLOR)
}

export function drawSlotPoints(scene: SceneRenderer, skeleton: Skeleton, pixelSize: number): void {
  const half = pixelSize * 3
  for (const slot of skeleton.drawOrder) {
    if (!slot.bone.active || !slot.getAttachment()) continue
    const x = slot.bone.worldX
    const y = slot.bone.worldY
    scene.rect(true, x - half, y - half, half * 2, half * 2, SLOT_COLOR)
  }
}

export function drawHighlight(scene: SceneRenderer, skeleton: Skeleton, slotName: string, pixelSize: number): void {
  const slot = skeleton.findSlot(slotName)
  if (!slot) return
  const outline = attachmentOutline(slot)
  if (outline && outline.length >= 4) drawOutline(scene, outline, HIGHLIGHT_COLOR, pixelSize * 2)
  const half = pixelSize * 5
  scene.rect(false, slot.bone.worldX - half, slot.bone.worldY - half, half * 2, half * 2, HIGHLIGHT_COLOR)
}

const BONE_HIGHLIGHT = new Color(0.98, 0.35, 0.55, 1)

export function drawBoneHighlight(scene: SceneRenderer, skeleton: Skeleton, boneName: string, pixelSize: number): void {
  const bone = skeleton.findBone(boneName)
  if (!bone) return
  const length = Math.max(bone.data.length, pixelSize * 24)
  const endX = bone.worldX + bone.a * length
  const endY = bone.worldY + bone.c * length
  scene.rectLine(true, bone.worldX, bone.worldY, endX, endY, pixelSize * 3, BONE_HIGHLIGHT)
  scene.circle(false, bone.worldX, bone.worldY, pixelSize * 7, BONE_HIGHLIGHT, 24)
}

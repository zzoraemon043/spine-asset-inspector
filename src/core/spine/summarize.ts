import {
  BoundingBoxAttachment,
  ClippingAttachment,
  EventTimeline,
  MeshAttachment,
  PathAttachment,
  PointAttachment,
  RegionAttachment,
  type Animation,
  type Attachment,
  type BoneTimeline,
  type SkeletonData,
  type SlotTimeline,
  type TextureAtlas,
} from '@esotericsoftware/spine-core'
import type {
  AnimationInfo,
  AssetOrigin,
  AssetSummary,
  AttachmentKind,
  SkeletonFormat,
  SkeletonStats,
  SlotAttachmentInfo,
  SlotInfo,
  SpineVersionInfo,
  TimelineEventMarker,
  BoneInfo,
  EventInfo,
  ConstraintInfo,
} from '../types'

export const DEFAULT_FPS = 30

export function attachmentKind(attachment: Attachment): AttachmentKind {
  if (attachment instanceof RegionAttachment) return 'region'
  if (attachment instanceof MeshAttachment) return 'mesh'
  if (attachment instanceof BoundingBoxAttachment) return 'boundingbox'
  if (attachment instanceof ClippingAttachment) return 'clipping'
  if (attachment instanceof PathAttachment) return 'path'
  if (attachment instanceof PointAttachment) return 'point'
  return 'unknown'
}

function hasBoneIndex(timeline: unknown): timeline is BoneTimeline {
  return typeof (timeline as { boneIndex?: unknown }).boneIndex === 'number'
}

function hasSlotIndex(timeline: unknown): timeline is SlotTimeline {
  return typeof (timeline as { slotIndex?: unknown }).slotIndex === 'number'
}

export function eventMarkers(animation: Animation): TimelineEventMarker[] {
  const markers: TimelineEventMarker[] = []
  for (const timeline of animation.timelines) {
    if (!(timeline instanceof EventTimeline)) continue
    for (const event of timeline.events) {
      markers.push({
        name: event.data.name,
        time: event.time,
        intValue: event.intValue,
        floatValue: event.floatValue,
        stringValue: event.stringValue ?? '',
      })
    }
  }
  return markers.sort((a, b) => a.time - b.time)
}

export function describeAnimation(animation: Animation): AnimationInfo {
  let boneTimelineCount = 0
  let slotTimelineCount = 0
  for (const timeline of animation.timelines) {
    if (hasBoneIndex(timeline)) boneTimelineCount += 1
    else if (hasSlotIndex(timeline)) slotTimelineCount += 1
  }
  return {
    name: animation.name,
    duration: animation.duration,
    events: eventMarkers(animation),
    boneTimelineCount,
    slotTimelineCount,
  }
}

export function describeSlots(data: SkeletonData): SlotInfo[] {
  return data.slots.map((slot) => {
    const byName = new Map<string, { type: AttachmentKind; skins: string[] }>()
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        if (entry.slotIndex !== slot.index) continue
        const existing = byName.get(entry.name)
        if (existing) existing.skins.push(skin.name)
        else byName.set(entry.name, { type: attachmentKind(entry.attachment), skins: [skin.name] })
      }
    }
    const attachments: SlotAttachmentInfo[] = [...byName.entries()]
      .map(([name, value]) => ({ name, type: value.type, skins: value.skins }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      index: slot.index,
      name: slot.name,
      bone: slot.boneData.name,
      setupAttachment: slot.attachmentName,
      attachments,
    }
  })
}

export function describeBones(data: SkeletonData): BoneInfo[] {
  return data.bones.map((bone) => ({
    index: bone.index,
    name: bone.name,
    parent: bone.parent?.name ?? null,
    length: bone.length,
    x: bone.x,
    y: bone.y,
    rotation: bone.rotation,
    scaleX: bone.scaleX,
    scaleY: bone.scaleY,
    shearX: bone.shearX,
    shearY: bone.shearY,
  }))
}

export function describeEvents(data: SkeletonData): EventInfo[] {
  return data.events.map((event) => ({
    name: event.name,
    intValue: event.intValue,
    floatValue: event.floatValue,
    stringValue: event.stringValue ?? '',
    audioPath: event.audioPath || null,
  }))
}

export function describeConstraints(data: SkeletonData): ConstraintInfo[] {
  return [
    ...data.ikConstraints.map((constraint) => ({ name: constraint.name, type: 'ik' as const, bones: constraint.bones.map((bone) => bone.name), target: constraint.target.name })),
    ...data.transformConstraints.map((constraint) => ({ name: constraint.name, type: 'transform' as const, bones: constraint.bones.map((bone) => bone.name), target: constraint.target.name })),
  ]
}

export function describeStats(data: SkeletonData, atlas: TextureAtlas): SkeletonStats {
  return {
    bones: data.bones.length,
    slots: data.slots.length,
    skins: data.skins.length,
    animations: data.animations.length,
    events: data.events.length,
    ikConstraints: data.ikConstraints.length,
    transformConstraints: data.transformConstraints.length,
    pathConstraints: data.pathConstraints.length,
    physicsConstraints: data.physicsConstraints.length,
    atlasPages: atlas.pages.length,
    atlasRegions: atlas.regions.length,
    width: data.width,
    height: data.height,
  }
}

export interface SummaryInput {
  readonly name: string
  readonly origin: AssetOrigin
  readonly format: SkeletonFormat
  readonly fileName: string
  readonly data: SkeletonData
  readonly atlas: TextureAtlas
  readonly version: SpineVersionInfo
  readonly upgradedFrom?: string | null
  readonly legacyWarnings?: readonly string[]
  readonly premultipliedAlpha: boolean
  readonly skeletonCandidates: readonly string[]
  readonly warnings: readonly string[]
}

export function summarize(input: SummaryInput): AssetSummary {
  const { data } = input
  const warnings = [...input.warnings]
  const upgradedFrom = input.upgradedFrom ?? null
  if (upgradedFrom) {
    warnings.push(`已自動將 Spine ${upgradedFrom} 二進位升級為 4.2 結構解析，請與原編輯器畫面比對確認`)
    warnings.push(...(input.legacyWarnings ?? []))
  } else if (!input.version.compatible) {
    warnings.push(`骨架版本 ${input.version.raw ?? '未知'} 與執行環境 4.2 不一致，可能無法正確解析`)
  }
  return {
    name: input.name,
    origin: input.origin,
    format: input.format,
    fileName: input.fileName,
    version: input.version,
    upgradedFrom,
    fps: data.fps > 0 ? data.fps : DEFAULT_FPS,
    premultipliedAlpha: input.premultipliedAlpha,
    stats: describeStats(data, input.atlas),
    animations: data.animations.map(describeAnimation),
    skins: data.skins.map((skin) => skin.name),
    slots: describeSlots(data),
    bones: describeBones(data),
    events: describeEvents(data),
    constraints: describeConstraints(data),
    eventNames: data.events.map((event) => event.name),
    skeletonCandidates: input.skeletonCandidates,
    warnings,
  }
}

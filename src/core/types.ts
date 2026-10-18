export type SkeletonFormat = 'json' | 'binary'

export type AssetOrigin = 'demo' | 'local'

export interface VirtualFile {
  readonly path: string
  readonly name: string
  readonly baseName: string
  readonly extension: string
  readonly bytes: Uint8Array
}

export type FileRole = 'skeleton-json' | 'skeleton-binary' | 'atlas' | 'texture' | 'archive' | 'audio' | 'unknown'

export interface TexturePixels {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8ClampedArray
}

export interface SkeletonSource {
  readonly fileName: string
  readonly format: SkeletonFormat
  readonly data: string | Uint8Array
}

export interface ResolvedBundle {
  readonly skeleton: VirtualFile
  readonly format: SkeletonFormat
  readonly atlas: VirtualFile
  readonly textures: ReadonlyMap<string, VirtualFile>
  readonly skeletonCandidates: readonly string[]
  readonly warnings: readonly string[]
}

export interface AssetSource<TImage> {
  readonly name: string
  readonly origin: AssetOrigin
  readonly skeleton: SkeletonSource
  readonly atlasText: string
  readonly pages: ReadonlyMap<string, TImage>
  readonly skeletonCandidates: readonly string[]
  readonly warnings: readonly string[]
}

export interface SpineVersionInfo {
  readonly raw: string | null
  readonly major: number | null
  readonly minor: number | null
  readonly compatible: boolean
}

export interface TimelineEventMarker {
  readonly name: string
  readonly time: number
  readonly intValue: number
  readonly floatValue: number
  readonly stringValue: string
}

export interface AnimationInfo {
  readonly name: string
  readonly duration: number
  readonly events: readonly TimelineEventMarker[]
  readonly boneTimelineCount: number
  readonly slotTimelineCount: number
}

export interface SlotInfo {
  readonly index: number
  readonly name: string
  readonly bone: string
  readonly setupAttachment: string | null
  readonly attachments: readonly SlotAttachmentInfo[]
}

export interface SlotAttachmentInfo {
  readonly name: string
  readonly type: AttachmentKind
  readonly skins: readonly string[]
}

export type AttachmentKind = 'region' | 'mesh' | 'boundingbox' | 'path' | 'point' | 'clipping' | 'unknown'

export interface BoneInfo {
  readonly index: number
  readonly name: string
  readonly parent: string | null
  readonly length: number
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly scaleX: number
  readonly scaleY: number
  readonly shearX: number
  readonly shearY: number
}

export interface EventInfo {
  readonly name: string
  readonly intValue: number
  readonly floatValue: number
  readonly stringValue: string
  readonly audioPath: string | null
}

export interface ConstraintInfo {
  readonly name: string
  readonly type: 'ik' | 'transform'
  readonly bones: readonly string[]
  readonly target: string
}

export interface SkeletonStats {
  readonly bones: number
  readonly slots: number
  readonly skins: number
  readonly animations: number
  readonly events: number
  readonly ikConstraints: number
  readonly transformConstraints: number
  readonly pathConstraints: number
  readonly physicsConstraints: number
  readonly atlasPages: number
  readonly atlasRegions: number
  readonly width: number
  readonly height: number
}

export interface AssetSummary {
  readonly name: string
  readonly origin: AssetOrigin
  readonly format: SkeletonFormat
  readonly fileName: string
  readonly version: SpineVersionInfo
  readonly upgradedFrom: string | null
  readonly fps: number
  readonly premultipliedAlpha: boolean
  readonly stats: SkeletonStats
  readonly animations: readonly AnimationInfo[]
  readonly skins: readonly string[]
  readonly slots: readonly SlotInfo[]
  readonly bones: readonly BoneInfo[]
  readonly events: readonly EventInfo[]
  readonly constraints: readonly ConstraintInfo[]
  readonly eventNames: readonly string[]
  readonly skeletonCandidates: readonly string[]
  readonly warnings: readonly string[]
}

export type EventKind = 'custom' | 'start' | 'interrupt' | 'end' | 'complete'

export interface EventRecord {
  readonly id: number
  readonly kind: EventKind
  readonly name: string
  readonly animation: string
  readonly track: number
  readonly animationTime: number
  readonly wallTime: number
  readonly intValue: number
  readonly floatValue: number
  readonly stringValue: string
  readonly audioPath: string | null
  readonly volume: number
  readonly balance: number
}

export type MixBlendMode = 'replace' | 'add'

export interface TrackLayer {
  readonly index: number
  readonly animation: string | null
  readonly loop: boolean
  readonly alpha: number
  readonly blend: MixBlendMode
  readonly enabled: boolean
}

export interface MixPair {
  readonly from: string
  readonly to: string
  readonly duration: number
}

export interface SlotOverride {
  readonly visible: boolean
  readonly attachment: string | null | undefined
}

export interface DebugFlags {
  readonly bones: boolean
  readonly slots: boolean
  readonly meshHull: boolean
  readonly meshTriangles: boolean
  readonly regions: boolean
  readonly boundingBoxes: boolean
  readonly paths: boolean
  readonly clipping: boolean
}

export type DebugFlag = keyof DebugFlags

export interface TrackRuntimeState {
  readonly index: number
  readonly animation: string | null
  readonly trackTime: number
  readonly animationTime: number
  readonly duration: number
  readonly loop: boolean
  readonly mixingFrom: string | null
  readonly mixProgress: number
  readonly mixDuration: number
}

export interface PlaybackSnapshot {
  readonly time: number
  readonly duration: number
  readonly frame: number
  readonly frameCount: number
  readonly tracks: readonly TrackRuntimeState[]
}

export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

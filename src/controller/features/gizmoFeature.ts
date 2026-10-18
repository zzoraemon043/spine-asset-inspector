import { screenToWorld, worldToScreen } from '@/core/render/camera'
import { gizmoLayout, handlePoints, hitGizmo, type GizmoLayout } from '@/core/gizmo/layout'
import { GizmoDrag } from '@/core/gizmo/drag'
import { pickBone } from '@/core/gizmo/pick'
import { bonePose, boneSegments, type PoseBase } from '@/core/gizmo/runtimePose'
import type { GizmoHandle, GizmoMode, SetupPatch, Vec } from '@/core/gizmo/types'
import type { GizmoRender } from '@/core/render/gizmoOverlay'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore, type GizmoScreen } from '@/store/liveStore'
import type { StageAdapter } from '../types'
import type { LoadedAsset } from './host'

export interface GizmoHost<TImage> {
  asset(): LoadedAsset<TImage> | null
  stage(): StageAdapter<TImage> | null
  target(): PoseBase | null
  snapshot(bone: string): unknown
  preview(bone: string, values: SetupPatch, snapshot: unknown): void
  release(bone: string, snapshot: unknown): void
  commit(bone: string, values: SetupPatch, label: string): boolean
  selectBone(name: string): void
  publishLive(): void
}

export const PICK_TOLERANCE = 6

const COMMIT_LABEL: Record<GizmoMode, string> = { translate: '移動骨骼', rotate: '旋轉骨骼', scale: '縮放骨骼' }

export class GizmoFeature<TImage> {
  private readonly host: GizmoHost<TImage>
  private drag: GizmoDrag | null = null
  private snapshot: unknown = null
  private hover: GizmoHandle | null = null
  private published = ''

  constructor(host: GizmoHost<TImage>) {
    this.host = host
  }

  get dragging(): boolean {
    return this.drag !== null
  }

  private ratio(): number {
    return this.host.stage()?.pixelRatio ?? 1
  }

  private toWorld(cssX: number, cssY: number): Vec | null {
    const stage = this.host.stage()
    if (!stage) return null
    const ratio = this.ratio()
    return screenToWorld(stage.getView(), stage.viewport, cssX * ratio, cssY * ratio)
  }

  private unit(): number {
    const stage = this.host.stage()
    return stage ? this.ratio() / stage.getView().scale : 1
  }

  activeBone(): string | null {
    const state = useInspectorStore.getState()
    if (!this.host.target() || !state.editor.enabled || state.selection?.kind !== 'bone') return null
    return state.selection.name
  }

  layout(): GizmoLayout | null {
    const bone = this.activeBone()
    const skeleton = this.host.asset()?.instance.skeleton
    if (!bone || !skeleton) return null
    const pose = bonePose(skeleton, bone, this.host.target() ?? 'setup')
    return pose ? gizmoLayout(pose, useInspectorStore.getState().gizmoMode, this.unit()) : null
  }

  renderState(): GizmoRender | null {
    const layout = this.layout()
    this.publishScreen(layout)
    return layout ? { layout, active: this.drag?.handle ?? null, hover: this.hover } : null
  }

  private publishScreen(layout: GizmoLayout | null): void {
    const stage = this.host.stage()
    let screen: GizmoScreen | null = null
    if (layout && stage) {
      const ratio = this.ratio()
      const toCss = (point: Vec): readonly [number, number] => {
        const value = worldToScreen(stage.getView(), stage.viewport, point.x, point.y)
        return [Math.round((value.x / ratio) * 10) / 10, Math.round((value.y / ratio) * 10) / 10]
      }
      const handles: Partial<Record<GizmoHandle, readonly [number, number]>> = {}
      for (const [handle, point] of Object.entries(handlePoints(layout)) as Array<[GizmoHandle, Vec]>) handles[handle] = toCss(point)
      screen = { bone: layout.bone, mode: layout.mode, origin: toCss(layout.origin), tip: toCss(layout.tip), handles }
    }
    const key = JSON.stringify(screen)
    if (key === this.published) return
    this.published = key
    useLiveStore.setState({ gizmo: screen })
  }

  hoverAt(cssX: number, cssY: number): GizmoHandle | null {
    if (this.drag) return this.drag.handle
    const layout = this.layout()
    const point = this.toWorld(cssX, cssY)
    const next = layout && point ? hitGizmo(layout, point) : null
    if (next !== this.hover) {
      this.hover = next
      useLiveStore.setState({ gizmoHover: next })
    }
    return next
  }

  begin(cssX: number, cssY: number): boolean {
    const layout = this.layout()
    const point = this.toWorld(cssX, cssY)
    const skeleton = this.host.asset()?.instance.skeleton
    if (!layout || !point || !skeleton) return false
    const handle = hitGizmo(layout, point)
    const pose = handle ? bonePose(skeleton, layout.bone, this.host.target() ?? 'setup') : null
    if (!handle || !pose) return false
    this.drag = new GizmoDrag(handle, pose, point)
    this.snapshot = this.host.snapshot(pose.name)
    const values: SetupPatch = Object.fromEntries(this.drag.fields.map((field) => [field, pose.setup[field]]))
    useLiveStore.setState({ gizmoPreview: { bone: pose.name, handle, values }, gizmoHover: handle })
    return true
  }

  move(cssX: number, cssY: number, shift = false): boolean {
    const drag = this.drag
    const point = this.toWorld(cssX, cssY)
    const asset = this.host.asset()
    if (!drag || !point || !asset) return false
    const snap = useInspectorStore.getState().gizmoSnap !== shift
    const values = drag.update(point, snap)
    this.host.preview(drag.pose.name, values, this.snapshot)
    useLiveStore.setState({ gizmoPreview: { bone: drag.pose.name, handle: drag.handle, values } })
    this.host.publishLive()
    return true
  }

  private restore(drag: GizmoDrag): void {
    if (this.host.asset()) this.host.release(drag.pose.name, this.snapshot)
    this.snapshot = null
  }

  end(): boolean {
    const drag = this.drag
    if (!drag) return false
    const preview = useLiveStore.getState().gizmoPreview
    this.drag = null
    this.restore(drag)
    useLiveStore.setState({ gizmoPreview: null })
    const values = preview && preview.bone === drag.pose.name ? preview.values : {}
    const committed = drag.changed(values) && this.host.commit(drag.pose.name, values, `${COMMIT_LABEL[useInspectorStore.getState().gizmoMode]} ${drag.pose.name}`)
    this.host.publishLive()
    return committed
  }

  cancel(): boolean {
    const drag = this.drag
    if (!drag) return false
    this.drag = null
    this.restore(drag)
    useLiveStore.setState({ gizmoPreview: null })
    this.host.publishLive()
    return true
  }

  pick(cssX: number, cssY: number): string | null {
    const skeleton = this.host.asset()?.instance.skeleton
    const point = this.toWorld(cssX, cssY)
    if (!skeleton || !point) return null
    const name = pickBone(boneSegments(skeleton), point, PICK_TOLERANCE * this.unit())
    if (name) this.host.selectBone(name)
    return name
  }

  reset(): void {
    this.drag = null
    this.hover = null
    useLiveStore.setState({ gizmoPreview: null, gizmoHover: null })
  }
}

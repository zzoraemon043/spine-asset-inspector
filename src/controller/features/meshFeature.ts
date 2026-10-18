import type { MeshAttachment, Slot } from '@esotericsoftware/spine-core'
import { screenToWorld, worldToScreen } from '@/core/render/camera'
import { deformLength, isMesh, offsetDeform, pickVertex, vertexCount, worldVertices } from '@/core/animation/meshDeform'
import { deformTarget } from '@/core/animation/channels'
import type { Vec } from '@/core/gizmo/types'
import { patchState, pushNotice, useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { StageAdapter } from '../types'
import type { LoadedAsset } from './host'
import type { AnimateFeature } from './animateFeature'

export interface MeshHost<TImage> {
  asset(): LoadedAsset<TImage> | null
  stage(): StageAdapter<TImage> | null
  readonly animate: AnimateFeature<TImage>
  publishLive(): void
}

export interface MeshRender {
  readonly vertices: readonly number[]
  readonly selected: readonly number[]
}

export interface MeshTarget {
  readonly slot: Slot
  readonly attachment: MeshAttachment
  readonly skin: string
  readonly key: string
}

export const VERTEX_PICK = 8

interface DeformDrag {
  readonly target: MeshTarget
  readonly start: Vec
  readonly base: number[]
  readonly vertices: readonly number[]
  offsets: number[] | null
}

export class MeshFeature<TImage> {
  private readonly host: MeshHost<TImage>
  private drag: DeformDrag | null = null
  private published = ''

  constructor(host: MeshHost<TImage>) {
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

  target(): MeshTarget | null {
    const state = useInspectorStore.getState()
    const instance = this.host.asset()?.instance
    const selection = state.selection
    if (!instance || !state.animateMode || state.playing || !state.editor.enabled || selection?.kind !== 'attachment' || !selection.slot) return null
    const slot = instance.skeleton.findSlot(selection.slot)
    const attachment = slot?.getAttachment()
    if (!slot || !isMesh(attachment) || attachment.name !== selection.name) return null
    const candidates = [...instance.skins].reverse().concat('default')
    const skin = candidates.find((name) => instance.data.findSkin(name)?.getAttachment(slot.data.index, attachment.name) === attachment) ?? 'default'
    return { slot, attachment, skin, key: deformTarget(skin, slot.data.name, attachment.name) }
  }

  private selection(): number[] {
    return useInspectorStore.getState().meshSelection
  }

  renderState(): MeshRender | null {
    const target = this.target()
    const render = target ? { vertices: worldVertices(target.slot, target.attachment), selected: this.selection() } : null
    this.publish(render)
    return render
  }

  private publish(render: MeshRender | null): void {
    const stage = this.host.stage()
    let screen: Array<readonly [number, number]> | null = null
    if (render && stage) {
      const ratio = this.ratio()
      screen = []
      for (let index = 0; index * 2 + 1 < render.vertices.length; index += 1) {
        const point = worldToScreen(stage.getView(), stage.viewport, render.vertices[index * 2], render.vertices[index * 2 + 1])
        screen.push([Math.round((point.x / ratio) * 10) / 10, Math.round((point.y / ratio) * 10) / 10])
      }
    }
    const key = JSON.stringify(screen)
    if (key === this.published) return
    this.published = key
    useLiveStore.setState({ meshScreen: screen })
  }

  hit(cssX: number, cssY: number): number | null {
    const target = this.target()
    const point = this.toWorld(cssX, cssY)
    if (!target || !point) return null
    return pickVertex(worldVertices(target.slot, target.attachment), point, VERTEX_PICK * this.unit())
  }

  select(vertices: readonly number[], mode: 'replace' | 'toggle' = 'replace'): void {
    const current = new Set(mode === 'replace' ? [] : this.selection())
    for (const vertex of vertices) {
      if (mode === 'toggle' && current.has(vertex)) current.delete(vertex)
      else current.add(vertex)
    }
    patchState({ meshSelection: [...current].sort((a, b) => a - b) })
  }

  selectAll(): void {
    const target = this.target()
    if (target) this.select(Array.from({ length: vertexCount(target.attachment) }, (_, index) => index))
  }

  clearSelection(): void {
    if (this.selection().length > 0) patchState({ meshSelection: [] })
  }

  begin(cssX: number, cssY: number, additive = false): boolean {
    const target = this.target()
    const vertex = this.hit(cssX, cssY)
    const point = this.toWorld(cssX, cssY)
    if (!target || vertex === null || !point) return false
    const selected = this.selection()
    if (additive) this.select([vertex], 'toggle')
    else if (!selected.includes(vertex)) this.select([vertex])
    const vertices = this.selection()
    if (vertices.length === 0) return true
    const length = deformLength(target.attachment)
    const base = target.slot.deform.length === length ? [...target.slot.deform] : new Array<number>(length).fill(0)
    this.drag = { target, start: point, base, vertices, offsets: null }
    return true
  }

  move(cssX: number, cssY: number): boolean {
    const drag = this.drag
    const point = this.toWorld(cssX, cssY)
    const instance = this.host.asset()?.instance
    if (!drag || !point || !instance) return false
    drag.offsets = offsetDeform(instance.skeleton, drag.target.slot, drag.target.attachment, drag.base, drag.vertices, { x: point.x - drag.start.x, y: point.y - drag.start.y })
    instance.setDeformOverride(drag.target.slot.data.name, drag.offsets)
    this.host.publishLive()
    return true
  }

  end(): boolean {
    const drag = this.drag
    if (!drag) return false
    this.drag = null
    this.host.asset()?.instance.setDeformOverride(drag.target.slot.data.name, null)
    if (!drag.offsets) return false
    return this.host.animate.keyDeform(drag.target.key, drag.offsets, `變形 ${drag.target.attachment.name}（${drag.vertices.length} 個頂點）`)
  }

  cancel(): boolean {
    const drag = this.drag
    if (!drag) return false
    this.drag = null
    this.host.asset()?.instance.setDeformOverride(drag.target.slot.data.name, null)
    this.host.publishLive()
    return true
  }

  resetDeform(): boolean {
    const target = this.target()
    if (!target) {
      pushNotice('warning', '請在動畫模式暫停時選取目前顯示中的網格部件')
      return false
    }
    return this.host.animate.keyDeform(target.key, new Array<number>(deformLength(target.attachment)).fill(0), `重設變形 ${target.attachment.name}`)
  }

  reset(): void {
    this.drag = null
    patchState({ meshSelection: [] })
  }
}

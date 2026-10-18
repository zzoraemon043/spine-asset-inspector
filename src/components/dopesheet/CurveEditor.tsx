import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { channelSpec } from '@/core/animation/channels'
import { channelKeys, parseKeyId, type KeyRef } from '@/core/animation/keyCommands'
import { segmentOf } from '@/core/animation/keyOps'
import { clampHandles, CURVE_PRESETS, LINEAR_HANDLES, sampleCurve, specOf, type CurveSpec, type Handles } from '@/core/animation/curveShape'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

export const GRAPH = { width: 224, height: 136, pad: 24 } as const

const KIND_LABEL: Record<CurveSpec['kind'], string> = { linear: '線性', stepped: '步進', bezier: '貝茲曲線' }

function toScreen(x: number, y: number) {
  const inner = { width: GRAPH.width - GRAPH.pad * 2, height: GRAPH.height - GRAPH.pad * 2 }
  return { x: GRAPH.pad + x * inner.width, y: GRAPH.height - GRAPH.pad - y * inner.height }
}

function fromScreen(x: number, y: number) {
  const inner = { width: GRAPH.width - GRAPH.pad * 2, height: GRAPH.height - GRAPH.pad * 2 }
  return { x: (x - GRAPH.pad) / inner.width, y: (GRAPH.height - GRAPH.pad - y) / inner.height }
}

export function useCurveTargets(): { refs: KeyRef[]; spec: CurveSpec | null } {
  const selection = useInspectorStore((state) => state.keySelection)
  const document = useInspectorStore((state) => state.editor.document)
  const animation = useInspectorStore((state) => state.animation)
  return useMemo(() => {
    const refs: KeyRef[] = []
    let spec: CurveSpec | null = null
    let specFlat = true
    if (!document || !animation) return { refs, spec }
    for (const id of selection) {
      const ref = parseKeyId(id)
      if (!ref || !channelSpec(ref.channel).curved) continue
      let keys
      try {
        keys = channelKeys(document, animation, ref.target, ref.channel)
      } catch {
        continue
      }
      const segment = segmentOf(keys, ref.index, channelSpec(ref.channel).progress)
      if (!segment) continue
      refs.push(ref)
      const flat = segment.v0.every((value, index) => Math.abs(value - (segment.v1[index] ?? value)) < 1e-9)
      if (!spec || (!flat && specFlat)) {
        spec = specOf(keys[ref.index].curve, segment)
        specFlat = flat
      }
    }
    return { refs, spec }
  }, [selection, document, animation])
}

export function CurveEditor() {
  const controller = useController()
  const { refs, spec } = useCurveTargets()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ handle: 0 | 1; pointerId: number } | null>(null)
  const [draft, setDraft] = useState<Handles | null>(null)
  if (!spec) {
    return (
      <div className="px-3 py-3 text-[11px] text-ink-400" data-testid="curve-editor-empty">
        在律動表選取後面還有下一格的關鍵影格，即可編輯兩格之間的過渡曲線。
      </div>
    )
  }
  const original = spec.kind === 'bezier' ? spec.handles : LINEAR_HANDLES
  const handles = draft ?? original
  const shown: CurveSpec = draft ? { kind: 'bezier', handles: draft } : spec
  const apply = (next: CurveSpec, label: string) => controller.animate.setCurve(next, `${label}（${refs.length} 段）`)
  const points = sampleCurve(shown, 40).map((point) => toScreen(point.x, point.y))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const start = toScreen(0, 0)
  const end = toScreen(1, 1)
  const first = toScreen(handles[0], handles[1])
  const second = toScreen(handles[2], handles[3])
  const editable = shown.kind === 'bezier'

  const localPoint = (event: PointerEvent<SVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    const scaleX = box && box.width > 0 ? GRAPH.width / box.width : 1
    const scaleY = box && box.height > 0 ? GRAPH.height / box.height : 1
    return fromScreen((event.clientX - (box?.left ?? 0)) * scaleX, (event.clientY - (box?.top ?? 0)) * scaleY)
  }

  const onHandleDown = (handle: 0 | 1) => (event: PointerEvent<SVGCircleElement>) => {
    if (!editable) return
    event.stopPropagation()
    svgRef.current?.setPointerCapture?.(event.pointerId)
    dragRef.current = { handle, pointerId: event.pointerId }
    setDraft(handles)
  }

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = localPoint(event)
    const next = [...(draft ?? handles)]
    next[drag.handle * 2] = point.x
    next[drag.handle * 2 + 1] = point.y
    setDraft(clampHandles(next))
  }

  const onUp = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const result = draft
    setDraft(null)
    if (result && (spec.kind !== 'bezier' || result.some((value, index) => value !== original[index]))) apply({ kind: 'bezier', handles: result }, '調整曲線控制桿')
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2" data-testid="curve-editor">
      <div className="flex items-center gap-1">
        {(['linear', 'stepped', 'bezier'] as const).map((kind) => (
          <Button
            key={kind}
            size="xs"
            variant={shown.kind === kind ? 'active' : 'default'}
            onClick={() => apply(kind === 'bezier' ? { kind, handles: spec.kind === 'bezier' ? spec.handles : LINEAR_HANDLES } : { kind }, `曲線：${KIND_LABEL[kind]}`)}
            testId={`curve-kind-${kind}`}
          >
            {KIND_LABEL[kind]}
          </Button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-ink-400" data-testid="curve-target-count">{`${refs.length} 段`}</span>
      </div>
      <svg
        ref={svgRef}
        width={GRAPH.width}
        height={GRAPH.height}
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        className="touch-none rounded border border-ink-700 bg-ink-950"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        data-testid="curve-graph"
        data-handles={handles.join(',')}
        data-kind={shown.kind}
      >
        <rect x={start.x} y={end.y} width={end.x - start.x} height={start.y - end.y} className="fill-none stroke-ink-700" strokeDasharray="3 3" />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="stroke-ink-700" />
        {editable && <line x1={start.x} y1={start.y} x2={first.x} y2={first.y} className="stroke-signal-violet" />}
        {editable && <line x1={end.x} y1={end.y} x2={second.x} y2={second.y} className="stroke-signal-violet" />}
        <path d={path} className="fill-none stroke-accent-400" strokeWidth={2} data-testid="curve-path" />
        <circle cx={start.x} cy={start.y} r={3} className="fill-ink-300" />
        <circle cx={end.x} cy={end.y} r={3} className="fill-ink-300" />
        {editable && (
          <>
            <circle cx={first.x} cy={first.y} r={6} className={cx('cursor-grab fill-signal-violet stroke-white')} onPointerDown={onHandleDown(0)} data-testid="curve-handle-0" />
            <circle cx={second.x} cy={second.y} r={6} className="cursor-grab fill-signal-violet stroke-white" onPointerDown={onHandleDown(1)} data-testid="curve-handle-1" />
          </>
        )}
      </svg>
      <div className="grid grid-cols-4 gap-1">
        {CURVE_PRESETS.map((preset) => (
          <Button key={preset.id} size="xs" variant="ghost" onClick={() => apply(preset.spec, `曲線預設：${preset.label}`)} testId={`curve-preset-${preset.id}`}>
            {preset.label}
          </Button>
        ))}
      </div>
      {editable && <span className="font-mono text-[10px] text-ink-400" data-testid="curve-handles-text">{`(${handles[0]}, ${handles[1]})  (${handles[2]}, ${handles[3]})`}</span>}
    </div>
  )
}

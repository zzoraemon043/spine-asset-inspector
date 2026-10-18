import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { Dopesheet } from '../../src/components/dopesheet/Dopesheet'
import { GRAPH } from '../../src/components/dopesheet/CurveEditor'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const keys = (target: string, channel: string, animation = 'walk') => channelKeys(state().editor.document!, animation, target, channel)

function mount(node: ReactNode) {
  return render(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>{node}</ControllerProvider>)
}

function commit(testId: string, value: string) {
  const input = screen.getByTestId(testId)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.blur(input)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  act(() => {
    harness.controller.selectAnimation('walk')
    harness.controller.setAnimateMode(true)
  })
})

afterEach(() => cleanup())

describe('curve editor', () => {
  it('asks for a key with a following segment before editing', () => {
    mount(<Dopesheet />)
    expect(screen.getByTestId('curve-editor-empty')).toBeTruthy()
    act(() => harness.controller.animate.selectKeys(['torso::rotate::2']))
    expect(screen.getByTestId('curve-editor-empty')).toBeTruthy()
  })

  it('switches curve kinds and applies presets to every selected segment', () => {
    mount(<Dopesheet />)
    act(() => harness.controller.animate.selectKeys(['torso::rotate::0', 'cape::rotate::0']))
    expect(screen.getByTestId('curve-graph').getAttribute('data-kind')).toBe('linear')
    expect(screen.getByTestId('curve-target-count').textContent).toBe('2 段')
    fireEvent.click(screen.getByTestId('curve-kind-stepped'))
    expect(keys('torso', 'rotate')[0].curve).toBe('stepped')
    expect(keys('cape', 'rotate')[0].curve).toBe('stepped')
    expect(screen.getByTestId('segment-torso:rotate-0').getAttribute('data-kind')).toBe('stepped')
    fireEvent.click(screen.getByTestId('curve-preset-ease-out'))
    expect(screen.getByTestId('curve-graph').getAttribute('data-handles')).toBe('0,0,0.58,1')
    expect(screen.getByTestId('segment-torso:rotate-0').getAttribute('data-kind')).toBe('bezier')
    expect(state().editor.undoLabel).toBe('曲線預設：緩出（2 段）')
    fireEvent.click(screen.getByTestId('curve-kind-linear'))
    expect(keys('torso', 'rotate')[0].curve).toBe('linear')
    fireEvent.click(screen.getByTestId('curve-kind-bezier'))
    expect(screen.getByTestId('curve-graph').getAttribute('data-handles')).toBe('0.3333,0.3333,0.6667,0.6667')
  })

  it('drags a bezier handle and commits one history entry on release', () => {
    mount(<Dopesheet />)
    act(() => harness.controller.animate.selectKeys(['cape::rotate::0']))
    fireEvent.click(screen.getByTestId('curve-preset-ease-in-out'))
    const before = state().editor.entries.length
    const inner = { width: GRAPH.width - GRAPH.pad * 2, height: GRAPH.height - GRAPH.pad * 2 }
    const graph = screen.getByTestId('curve-graph')
    fireEvent.pointerDown(screen.getByTestId('curve-handle-0'), { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(graph, { pointerId: 1, clientX: GRAPH.pad + inner.width * 0.1, clientY: GRAPH.height - GRAPH.pad - inner.height * 0.9 })
    expect(screen.getByTestId('curve-graph').getAttribute('data-handles')).toBe('0.1,0.9,0.58,1')
    expect(state().editor.entries.length).toBe(before)
    fireEvent.pointerUp(graph, { pointerId: 1 })
    expect(state().editor.entries.length).toBe(before + 1)
    expect(state().editor.undoLabel).toBe('調整曲線控制桿（1 段）')
    expect(screen.getByTestId('curve-handles-text').textContent).toBe('(0.1, 0.9)  (0.58, 1)')
    fireEvent.pointerDown(screen.getByTestId('curve-handle-1'), { pointerId: 2 })
    fireEvent.pointerMove(graph, { pointerId: 2, clientX: 9999, clientY: -9999 })
    fireEvent.pointerUp(graph, { pointerId: 2 })
    expect(screen.getByTestId('curve-graph').getAttribute('data-handles')).toBe('0.1,0.9,1,2')
  })
})

describe('event and slot keys in the interface', () => {
  it('adds an event key from the toolbar and edits its parameters', () => {
    mount(<Dopesheet />)
    act(() => harness.controller.seekFrame(20))
    fireEvent.change(screen.getByTestId('event-add-name'), { target: { value: 'hit' } })
    fireEvent.click(screen.getByTestId('event-add'))
    const index = keys('events', 'event').findIndex((key) => key.extra.name === 'hit')
    expect(screen.getByTestId(`key-events-20`)).toBeTruthy()
    expect(screen.getByTestId('event-key-editor')).toBeTruthy()
    commit('event-key-int', '5')
    commit('event-key-float', '0.5')
    commit('event-key-string', 'crit')
    expect(keys('events', 'event')[index].extra).toEqual({ name: 'hit', int: 5, float: 0.5, string: 'crit' })
    fireEvent.change(screen.getByTestId('event-key-name'), { target: { value: 'fx' } })
    expect(keys('events', 'event')[index].extra.name).toBe('fx')
    expect(screen.getByTestId('dopesheet-row-events').textContent).toContain('事件')
  })

  it('keys slot attachment, color and alpha from the properties panel', () => {
    act(() => {
      harness.controller.seekFrame(4)
      harness.controller.select({ kind: 'slot', name: 'head' })
    })
    mount(
      <>
        <PropertiesPanel />
        <Dopesheet />
      </>,
    )
    fireEvent.change(screen.getByTestId('slot-key-attachment'), { target: { value: '__none__' } })
    expect(keys('head', 'attachment')).toHaveLength(1)
    expect(screen.getByTestId('dopesheet-row-slot:head:attachment')).toBeTruthy()
    commit('slot-key-color', 'ff0000ff')
    expect(keys('head', 'rgba')[0].values).toEqual([1, 0, 0, 1])
    commit('slot-key-alpha', '0.5')
    expect(Math.round(keys('head', 'rgba')[0].values[3] * 255)).toBe(128)
    expect((screen.getByTestId('slot-key-color') as HTMLInputElement).value).toBe('ff000080')
    act(() => harness.controller.seekFrame(10))
    fireEvent.click(screen.getByTestId('slot-key-all'))
    expect(keys('head', 'rgba')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('dopesheet-toggle-slot:head'))
    expect(screen.queryByTestId('dopesheet-row-slot:head:rgba')).toBeNull()
  })
})

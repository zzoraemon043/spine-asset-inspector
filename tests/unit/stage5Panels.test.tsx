import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { HierarchyPanel } from '../../src/components/tree/HierarchyPanel'
import { Dopesheet } from '../../src/components/dopesheet/Dopesheet'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { ikFixtureSource } from '../support/ikFixture'

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
  act(() => harness.controller.applySource(ikFixtureSource()))
})

afterEach(() => cleanup())

describe('stage 5 panels', () => {
  it('creates a blank animation and a skin from the skeleton properties', () => {
    mount(<PropertiesPanel />)
    fireEvent.change(screen.getByTestId('new-animation-name'), { target: { value: 'turn' } })
    fireEvent.click(screen.getByTestId('new-animation'))
    expect(state().asset!.animations.map((item) => item.name)).toContain('turn')
    expect(state().selection).toEqual({ kind: 'animation', name: 'turn' })
    act(() => harness.controller.select({ kind: 'skeleton', name: 'ik-demo' }))
    fireEvent.change(screen.getByTestId('new-skin-name'), { target: { value: 'armor/gold' } })
    fireEvent.keyDown(screen.getByTestId('new-skin-name'), { key: 'Enter' })
    expect(state().selection).toEqual({ kind: 'skin', name: 'armor/gold' })
    expect(screen.getByTestId('skin-attachments').textContent).toContain('尚未綁定')
    fireEvent.change(screen.getByTestId('skin-attachment-choice'), { target: { value: 'helmet/knight::helmet::helmet' } })
    fireEvent.click(screen.getByTestId('skin-attachment-add'))
    expect(screen.getByTestId('skin-attachments').textContent).toContain('helmet / helmet')
    commit('edit-skin-name', 'armor/platinum')
    expect(state().selection).toEqual({ kind: 'skin', name: 'armor/platinum' })
    fireEvent.click(screen.getByTestId('skin-attachment-remove-helmet-helmet'))
    expect(screen.getByTestId('skin-attachments').textContent).toContain('尚未綁定')
  })

  it('lists constraints in the tree and edits setup and animated values', () => {
    mount(
      <>
        <HierarchyPanel />
        <PropertiesPanel />
      </>,
    )
    fireEvent.click(screen.getByTestId('tree-constraint-ik-arm-ik'))
    expect(state().selection).toEqual({ kind: 'constraint', name: 'arm-ik', group: 'ik' })
    expect(screen.getByTestId('constraint-bones').textContent).toBe('arm-front-upper、arm-front-lower')
    expect(screen.getByTestId('constraint-target').textContent).toBe('aim')
    commit('constraint-setup-mix', '0.6')
    expect(harness.controller.instance!.skeleton.findIkConstraint('arm-ik')!.mix).toBeCloseTo(0.6)
    fireEvent.click(screen.getByTestId('constraint-setup-bendPositive'))
    expect(harness.controller.instance!.skeleton.findIkConstraint('arm-ik')!.bendDirection).toBe(-1)
    act(() => {
      harness.controller.selectAnimation('walk')
      harness.controller.setAnimateMode(true)
      harness.controller.seekFrame(5)
      harness.controller.select({ kind: 'constraint', name: 'cape-follow', group: 'transform' })
    })
    fireEvent.change(screen.getByTestId('constraint-key-slider-mixRotate'), { target: { value: '0.25' } })
    expect(keys('cape-follow', 'transform')[0].values[0]).toBe(0.25)
    commit('constraint-key-mixX', '0.75')
    expect(keys('cape-follow', 'transform')[0].values[1]).toBe(0.75)
    fireEvent.click(screen.getByTestId('constraint-key-all'))
    expect(state().editor.undoLabel).toBe('K 幀：變換限制器 cape-follow')
  })

  it('edits the draw order and shows the mesh deform tools for a selected mesh', () => {
    act(() => {
      harness.controller.selectAnimation('idle')
      harness.controller.setAnimateMode(true)
      harness.controller.seekFrame(4)
      harness.controller.select({ kind: 'slot', name: 'cape' })
    })
    const view = mount(
      <>
        <PropertiesPanel />
        <Dopesheet />
      </>,
    )
    const before = screen.getByTestId('draw-order-index').textContent
    fireEvent.click(screen.getByTestId('draw-order-forward'))
    expect(screen.getByTestId('draw-order-index').textContent).not.toBe(before)
    expect(screen.getByTestId('dopesheet-row-draworder')).toBeTruthy()
    fireEvent.click(screen.getByTestId('draw-order-reset'))
    expect(screen.getByTestId('draw-order-index').textContent).toBe(before)
    fireEvent.click(screen.getByTestId('draw-order-backward'))
    expect(keys('draworder', 'drawOrder', 'idle').length).toBeGreaterThan(0)
    act(() => harness.controller.select({ kind: 'attachment', name: 'cape', slot: 'cape' }))
    view.rerender(
      <ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>
        <PropertiesPanel />
        <Dopesheet />
      </ControllerProvider>,
    )
    expect(screen.getByTestId('mesh-selection').textContent).toBe('已選 0 / 6')
    fireEvent.click(screen.getByTestId('mesh-select-all'))
    expect(screen.getByTestId('mesh-selection').textContent).toBe('已選 6 / 6')
    fireEvent.click(screen.getByTestId('mesh-clear'))
    expect(state().meshSelection).toEqual([])
    fireEvent.click(screen.getByTestId('mesh-reset'))
    expect(screen.getByTestId('dopesheet-row-slot:cape:deform:default|cape')).toBeTruthy()
    act(() => harness.controller.setPlaying(true))
    expect(screen.getByTestId('mesh-hint').textContent).toContain('暫停後')
  })
})

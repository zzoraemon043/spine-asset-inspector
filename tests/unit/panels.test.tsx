import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { HierarchyPanel } from '../../src/components/tree/HierarchyPanel'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { ExportDialog } from '../../src/components/export/ExportDialog'
import { SlotInspectorPanel } from '../../src/components/panels/SlotInspectorPanel'
import { EventMonitorPanel } from '../../src/components/panels/EventMonitorPanel'
import { DebugPanel } from '../../src/components/panels/DebugPanel'
import { MixLabPanel } from '../../src/components/panels/MixLabPanel'
import { AtlasPanel } from '../../src/components/panels/AtlasPanel'
import { AuditPanel } from '../../src/components/panels/AuditPanel'
import { AudioPanel } from '../../src/components/panels/AudioPanel'
import { createVirtualFile } from '../../src/core/assets/virtualFile'
import { encodeWav, synthesizeClicks } from '../support/wav'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness

function mount(node: ReactNode) {
  return render(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>{node}</ControllerProvider>)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

afterEach(() => cleanup())

describe('panels', () => {
  it('shows the skeleton hierarchy and switches animations from the tree', () => {
    mount(<HierarchyPanel />)
    expect(screen.getByTestId('tree-skeleton')).toBeTruthy()
    expect(screen.getByTestId('tree-bone-torso')).toBeTruthy()
    expect(screen.getByTestId('animation-item-idle').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByTestId('animation-item-attack'))
    expect(useInspectorStore.getState().animation).toBe('attack')
    fireEvent.click(screen.getByTestId('tree-bone-torso'))
    expect(useInspectorStore.getState().selection).toEqual({ kind: 'bone', name: 'torso' })
    fireEvent.click(screen.getByTestId('tree-group-bones-toggle'))
    expect(screen.queryByTestId('tree-bone-torso')).toBeNull()
    fireEvent.change(screen.getByTestId('tree-filter'), { target: { value: 'weap' } })
    expect(screen.getByTestId('tree-bone-weapon')).toBeTruthy()
    expect(screen.getByTestId('tree-slot-weapon')).toBeTruthy()
    expect(screen.queryByTestId('animation-item-idle')).toBeNull()
  })

  it('composes skins from tree checkboxes', () => {
    mount(<HierarchyPanel />)
    fireEvent.click(screen.getByTestId('skin-toggle-armor/blue'))
    expect(useInspectorStore.getState().activeSkins).toContain('armor/blue')
    fireEvent.click(screen.getByTestId('skin-toggle-armor/red'))
    expect(useInspectorStore.getState().activeSkins).not.toContain('armor/red')
  })

  it('shows properties for the current selection', () => {
    mount(<PropertiesPanel />)
    expect(screen.getByTestId('stat-bones').textContent).toBe('18')
    expect(screen.getByTestId('stat-animations').textContent).toBe('7')
    act(() => harness.controller.select({ kind: 'slot', name: 'weapon' }))
    fireEvent.click(screen.getByTestId('prop-slot-visibility-weapon'))
    expect(useInspectorStore.getState().slotOverrides.weapon?.visible).toBe(false)
    act(() => harness.controller.select({ kind: 'animation', name: 'attack' }))
    expect(screen.getByTestId('properties-title').textContent).toBe('attack')
    fireEvent.click(screen.getByTestId('animation-export'))
    expect(useInspectorStore.getState()).toMatchObject({ exportOpen: true })
    expect(useInspectorStore.getState().exportSettings.animation).toBe('attack')
  })

  it('configures and runs exports from the dialog', async () => {
    mount(<ExportDialog />)
    expect(screen.queryByTestId('export-dialog')).toBeNull()
    act(() => harness.controller.setExportOpen(true, 'walk'))
    fireEvent.click(screen.getByTestId('export-format-sheet'))
    fireEvent.click(screen.getByTestId('export-size-fixed'))
    fireEvent.change(screen.getByTestId('export-width'), { target: { value: '256' } })
    fireEvent.change(screen.getByTestId('export-height'), { target: { value: '128' } })
    fireEvent.change(screen.getByTestId('export-fps'), { target: { value: '12' } })
    fireEvent.change(screen.getByTestId('export-start'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('export-end'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('export-bg-color'))
    expect(useInspectorStore.getState().exportSettings).toMatchObject({ format: 'sheet', sizeMode: 'fixed', width: 256, height: 128, fps: 12, startFrame: 2, endFrame: 5, background: '#000000' })
    expect(screen.getByTestId('export-summary').textContent).toContain('輸出 4 格')
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-run'))
    })
    expect(harness.saved.at(-1)?.fileName).toBe('walk_sheet.zip')
    expect(screen.getByTestId('export-result').textContent).toContain('walk_sheet.zip')
    fireEvent.click(screen.getByTestId('export-close'))
    expect(useInspectorStore.getState().exportOpen).toBe(false)
  })

  it('hides slots and forces attachments in the slot list', () => {
    mount(<SlotInspectorPanel />)
    fireEvent.click(screen.getByTestId('slot-visibility-weapon'))
    expect(useInspectorStore.getState().slotOverrides.weapon?.visible).toBe(false)
    fireEvent.change(screen.getByTestId('slot-attachment-helmet'), { target: { value: '__none__' } })
    expect(useInspectorStore.getState().slotOverrides.helmet).toEqual({ visible: true, attachment: null })
    fireEvent.click(screen.getByTestId('slot-select-torso'))
    expect(useInspectorStore.getState().selectedSlot).toBe('torso')
    fireEvent.click(screen.getByTestId('slots-reset'))
    expect(useInspectorStore.getState().slotOverrides).toEqual({})
  })

  it('shows recorded events with parameters', () => {
    mount(<EventMonitorPanel />)
    act(() => {
      harness.controller.selectAnimation('attack')
      harness.runFrames(30, 1 / 30)
    })
    const rows = screen.getAllByTestId('event-row')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.some((row) => row.textContent?.includes('s="slash"'))).toBe(true)
    expect(screen.getByTestId('event-count-hit').textContent).toBe('1')
    fireEvent.click(screen.getByTestId('event-clear'))
    expect(screen.queryAllByTestId('event-row')).toHaveLength(0)
  })

  it('toggles debug overlays', () => {
    mount(<DebugPanel />)
    fireEvent.click(screen.getByTestId('debug-meshTriangles'))
    expect(useInspectorStore.getState().debug.meshTriangles).toBe(true)
    expect(screen.getByTestId('debug-meshTriangles').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('debug-all-on'))
    expect(useInspectorStore.getState().debug.clipping).toBe(true)
  })

  it('drives the mix lab', () => {
    mount(<MixLabPanel />)
    fireEvent.change(screen.getByTestId('default-mix'), { target: { value: '0.5' } })
    expect(useInspectorStore.getState().defaultMix).toBe(0.5)
    fireEvent.change(screen.getByTestId('transition-to'), { target: { value: 'run' } })
    fireEvent.click(screen.getByTestId('save-mix-pair'))
    expect(useInspectorStore.getState().mixPairs).toHaveLength(1)
    fireEvent.click(screen.getByTestId('add-layer'))
    expect(screen.getByTestId('layer-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('layer-1-blend-add'))
    expect(useInspectorStore.getState().layers[0].blend).toBe('add')
    fireEvent.click(screen.getByTestId('run-transition'))
    expect(harness.controller.isTransitionPending()).toBe(true)
  })

  it('lists atlas regions and selects them', () => {
    mount(<AtlasPanel />)
    expect(screen.getAllByTestId(/^atlas-region-/)).toHaveLength(20)
    fireEvent.click(screen.getByTestId('atlas-select-sword'))
    expect(useInspectorStore.getState().selectedRegion).toBe('sword')
    fireEvent.change(screen.getByTestId('atlas-filter'), { target: { value: 'helmet' } })
    expect(screen.getAllByTestId(/^atlas-region-/)).toHaveLength(2)
    fireEvent.click(screen.getByTestId('atlas-restore-whitespace'))
    expect(useInspectorStore.getState().restoreWhitespace).toBe(false)
  })

  it('shows the audit grade and metrics', () => {
    mount(<AuditPanel />)
    expect(screen.getByTestId('audit-grade').textContent).toBe('優良')
    expect(screen.getByTestId('audit-value-bones').textContent).toBe('18')
    expect(screen.getByTestId('audit-metric-drawCalls').getAttribute('data-level')).toBe('good')
  })

  it('shows clips, alignment rows and bindings', async () => {
    mount(<AudioPanel />)
    expect(screen.getByTestId('audio-panel').textContent).toContain('尚未選擇同步音軌')
    await act(async () => {
      harness.controller.selectAnimation('walk')
      await harness.controller.audio.loadFiles([createVirtualFile('step.wav', encodeWav(synthesizeClicks({ sampleRate: 22050, duration: 1, clicks: [0.0, 0.5] }), 22050))])
    })
    expect(screen.getByTestId('audio-clip-step')).toBeTruthy()
    const rows = screen.getAllByTestId('audio-alignment-row')
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['aligned', 'aligned'])
    expect((screen.getByTestId('audio-bind-step') as HTMLSelectElement).value).toBe(useInspectorStore.getState().audioClips[0].id)
    fireEvent.click(screen.getByTestId('audio-enabled'))
    expect(useInspectorStore.getState().audioEnabled).toBe(false)
  })
})

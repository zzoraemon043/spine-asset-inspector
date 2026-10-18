import { describe, expect, it } from 'vitest'
import { enclosingCrop, handleCursor, moveCrop, RESIZE_HANDLES, resizeCrop, sanitizeCrop, screenToWorld } from '../../src/core/export/previewDrag'

const start = { x: -50, y: 0, width: 100, height: 200 }

describe('export crop drag math', () => {
  it('moves only the dragged edges of the crop rectangle', () => {
    expect(resizeCrop(start, 'e', 10, 99)).toEqual({ x: -50, y: 0, width: 110, height: 200 })
    expect(resizeCrop(start, 'w', 10, 99)).toEqual({ x: -40, y: 0, width: 90, height: 200 })
    expect(resizeCrop(start, 'n', 99, 20)).toEqual({ x: -50, y: 0, width: 100, height: 220 })
    expect(resizeCrop(start, 's', 99, 20)).toEqual({ x: -50, y: 20, width: 100, height: 180 })
    expect(resizeCrop(start, 'ne', 5, 5)).toEqual({ x: -50, y: 0, width: 105, height: 205 })
    expect(resizeCrop(start, 'sw', 5, 5)).toEqual({ x: -45, y: 5, width: 95, height: 195 })
    expect(resizeCrop(start, 'nw', -5, 5)).toEqual({ x: -55, y: 0, width: 105, height: 205 })
    expect(resizeCrop(start, 'se', 5, -5)).toEqual({ x: -50, y: -5, width: 105, height: 205 })
  })

  it('never inverts the rectangle and moves it as a whole', () => {
    expect(resizeCrop(start, 'w', 500, 0)).toEqual({ x: 49, y: 0, width: 1, height: 200 })
    expect(resizeCrop(start, 'e', -500, 0).width).toBe(1)
    expect(resizeCrop(start, 'n', 0, -500).height).toBe(1)
    expect(resizeCrop(start, 's', 0, 500)).toMatchObject({ y: 199, height: 1 })
    expect(moveCrop(start, 7, -3)).toEqual({ x: -43, y: -3, width: 100, height: 200 })
  })

  it('converts screen deltas to world deltas with y up', () => {
    expect(screenToWorld(10, 20, 0.5)).toEqual({ dx: 20, dy: -40 })
    expect(screenToWorld(10, 20, 0)).toEqual({ dx: 10, dy: -20 })
  })

  it('rounds crop edges and clamps invalid values', () => {
    expect(sanitizeCrop(null)).toBeNull()
    expect(sanitizeCrop({ x: 1.4, y: 2.6, width: 10.4, height: 0.2 })).toEqual({ x: 1, y: 3, width: 11, height: 1 })
    expect(sanitizeCrop({ x: Number.NaN, y: 0, width: 5, height: 5 })).toEqual({ x: 0, y: 0, width: 5, height: 5 })
    expect(sanitizeCrop({ x: 0, y: 0, width: 1e9, height: 5 })?.width).toBe(100000)
  })

  it('rounds a reset crop outward so the content always fits', () => {
    expect(enclosingCrop({ x: -10.4, y: 0.6, width: 20.2, height: 5.1 })).toEqual({ x: -11, y: 0, width: 21, height: 6 })
    expect(enclosingCrop({ x: 2, y: 2, width: 0, height: 0 })).toEqual({ x: 2, y: 2, width: 1, height: 1 })
  })

  it('maps every handle to a resize cursor', () => {
    expect(RESIZE_HANDLES.map(handleCursor)).toEqual(['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'])
  })
})

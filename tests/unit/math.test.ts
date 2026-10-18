import { describe, expect, it } from 'vitest'
import { clamp, clampSpeed, formatSeconds, frameAt, frameCountOf, ratioToTime, sampleTimes, timeOfFrame, timeToRatio } from '../../src/core/playback/timeMath'
import { clampScale, fitView, padBounds, panBy, screenToWorld, unionBounds, zoomAt } from '../../src/core/render/camera'

describe('time math', () => {
  it('clamps playback speed to the supported range', () => {
    expect(clampSpeed(0.01)).toBe(0.1)
    expect(clampSpeed(5)).toBe(2)
    expect(clampSpeed(0.333)).toBe(0.33)
    expect(clampSpeed(Number.NaN)).toBe(1)
    expect(clamp(5, 0, 3)).toBe(3)
  })

  it('converts between time and frames', () => {
    expect(frameAt(0.5, 30)).toBe(15)
    expect(frameAt(1 / 30, 30)).toBe(1)
    expect(frameAt(-1, 30)).toBe(0)
    expect(frameAt(1, 0)).toBe(0)
    expect(frameCountOf(1.2, 30)).toBe(36)
    expect(frameCountOf(0, 30)).toBe(0)
    expect(frameCountOf(0.001, 30)).toBe(1)
    expect(timeOfFrame(15, 30)).toBeCloseTo(0.5)
    expect(timeOfFrame(-4, 30)).toBe(0)
    expect(timeOfFrame(4, 0)).toBe(0)
  })

  it('maps scrubber ratios', () => {
    expect(ratioToTime(0.5, 2)).toBe(1)
    expect(ratioToTime(2, 2)).toBe(2)
    expect(timeToRatio(1, 4)).toBe(0.25)
    expect(timeToRatio(1, 0)).toBe(0)
  })

  it('samples frame times and formats seconds', () => {
    expect(sampleTimes(0.1, 30)).toHaveLength(3)
    expect(sampleTimes(0, 30)).toEqual([0])
    expect(formatSeconds(1.23456)).toBe('1.235s')
    expect(formatSeconds(-1, 1)).toBe('0.0s')
  })
})

describe('camera math', () => {
  const viewport = { width: 1000, height: 500 }

  it('fits bounds into the viewport with padding', () => {
    const view = fitView({ x: -50, y: 0, width: 100, height: 200 }, viewport, 0.1)
    expect(view.centerX).toBe(0)
    expect(view.centerY).toBe(100)
    expect(view.scale).toBeCloseTo(2)
  })

  it('keeps the anchor point fixed while zooming', () => {
    const view = { centerX: 10, centerY: 20, scale: 1 }
    const before = screenToWorld(view, viewport, 700, 100)
    const zoomed = zoomAt(view, viewport, 2.5, 700, 100)
    const after = screenToWorld(zoomed, viewport, 700, 100)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(zoomed.scale).toBe(2.5)
  })

  it('pans in screen space with y pointing down', () => {
    const view = panBy({ centerX: 0, centerY: 0, scale: 2 }, 20, 10)
    expect(view.centerX).toBe(-10)
    expect(view.centerY).toBe(5)
  })

  it('clamps scale', () => {
    expect(clampScale(0)).toBe(1)
    expect(clampScale(1000)).toBe(40)
    expect(clampScale(0.0001)).toBe(0.02)
  })

  it('unions and pads bounds', () => {
    const merged = unionBounds({ x: 0, y: 0, width: 10, height: 10 }, { x: -5, y: 5, width: 10, height: 10 })
    expect(merged).toEqual({ x: -5, y: 0, width: 15, height: 15 })
    expect(unionBounds(null, merged)).toBe(merged)
    expect(padBounds(merged, 2)).toEqual({ x: -7, y: -2, width: 19, height: 19 })
  })
})

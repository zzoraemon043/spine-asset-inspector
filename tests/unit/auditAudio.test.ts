import { describe, expect, it } from 'vitest'
import { MOBILE_BUDGETS, levelFor, worstLevel } from '../../src/core/audit/budgets'
import { auditSkeleton, poseMetrics, staticMetrics } from '../../src/core/audit/performanceAudit'
import { replaceRegion } from '../../src/core/atlas/regionOverride'
import { alignEvents, classifyDelta, nearestOnset, suggestOffset } from '../../src/core/audio/alignment'
import { computePeaks, detectOnsets, mixdown } from '../../src/core/audio/waveform'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { buildDemo, FakeTexture } from '../support/fakeTexture'
import { synthesizeClicks } from '../support/wav'

describe('performance audit', () => {
  it('classifies values against budgets', () => {
    expect(levelFor(10, { good: 10, warning: 20 })).toBe('good')
    expect(levelFor(11, { good: 10, warning: 20 })).toBe('warning')
    expect(levelFor(21, { good: 10, warning: 20 })).toBe('heavy')
    expect(worstLevel(['good', 'heavy', 'warning'])).toBe('heavy')
    expect(worstLevel([])).toBe('good')
    expect(new Set(MOBILE_BUDGETS.map((budget) => budget.id)).size).toBe(MOBILE_BUDGETS.length)
  })

  it('counts static asset metrics', () => {
    expect(staticMetrics(buildDemo().data)).toEqual({ totalVertices: 82, meshes: 1, weightedMeshes: 1, weightedInfluences: 8, clipping: 0, attachments: 21 })
  })

  it('counts the current pose and estimates draw calls', () => {
    const build = buildDemo()
    const instance = new SpineInstance(build.data)
    instance.setSkins(['armor/red', 'helmet/knight', 'weapon/sword'])
    expect(poseMetrics(instance.skeleton)).toEqual({ activeVertices: 70, activeTriangles: 36, drawCalls: 1, visibleAttachments: 17 })
    instance.setSlotOverride('weapon', { visible: false, attachment: undefined })
    expect(poseMetrics(instance.skeleton).activeVertices).toBe(66)
    replaceRegion(build.data, build.atlas, 'head', new FakeTexture(8, 8), 8, 8)
    expect(poseMetrics(instance.skeleton).drawCalls).toBe(3)
  })

  it('builds a graded report', () => {
    const build = buildDemo()
    const instance = new SpineInstance(build.data)
    const report = auditSkeleton(build.data, instance.skeleton, build.atlas.pages.length)
    expect(report.grade).toBe('good')
    expect(report.gradeLabel).toBe('優良')
    expect(report.metrics).toHaveLength(MOBILE_BUDGETS.length)
    expect(report.metrics.find((metric) => metric.id === 'bones')?.value).toBe(18)
    expect(report.findings).toEqual([])
    const strict = MOBILE_BUDGETS.map((definition) => (definition.id === 'bones' ? { ...definition, budget: { good: 5, warning: 10 } } : definition.id === 'slots' ? { ...definition, budget: { good: 5, warning: 20 } } : definition))
    const heavy = auditSkeleton(build.data, instance.skeleton, 1, strict)
    expect(heavy.grade).toBe('heavy')
    expect(heavy.gradeLabel).toBe('過重')
    expect(heavy.counts).toMatchObject({ heavy: 1, warning: 1 })
    expect(heavy.findings).toHaveLength(2)
    expect(heavy.findings[0]).toContain('過重')
  })
})

describe('audio analysis', () => {
  it('mixes channels down to mono', () => {
    expect(Array.from(mixdown([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5])
    expect(mixdown([]).length).toBe(0)
    const mono = new Float32Array([0.1])
    expect(mixdown([mono])).toBe(mono)
  })

  it('computes min and max peaks per bucket', () => {
    const peaks = computePeaks(new Float32Array([0, 0.5, -0.25, 1, -1, 0.2]), 3)
    expect(peaks.max).toEqual([0.5, 1, 0.2])
    expect(peaks.min).toEqual([0, -0.25, -1])
    expect(computePeaks(new Float32Array(0), 4).max).toEqual([0, 0, 0, 0])
  })

  it('detects click onsets within a few milliseconds', () => {
    const sampleRate = 22050
    const samples = synthesizeClicks({ sampleRate, duration: 1.2, clicks: [0.1, 0.5, 0.92] })
    const onsets = detectOnsets(samples, sampleRate)
    expect(onsets).toHaveLength(3)
    onsets.forEach((onset, index) => expect(Math.abs(onset - [0.1, 0.5, 0.92][index])).toBeLessThan(0.006))
    expect(detectOnsets(new Float32Array(1000), sampleRate)).toEqual([])
    expect(detectOnsets(samples, 0)).toEqual([])
  })

  it('aligns events against onsets with frame based tolerance', () => {
    const markers = [
      { name: 'step', time: 0, intValue: 0, floatValue: 0, stringValue: '' },
      { name: 'step', time: 0.5, intValue: 0, floatValue: 0, stringValue: '' },
      { name: 'hit', time: 0.9, intValue: 0, floatValue: 0, stringValue: '' },
    ]
    const rows = alignEvents(markers, [0.01, 0.55], 0, 30)
    expect(rows.map((row) => row.status)).toEqual(['aligned', 'near', 'missing'])
    expect(rows[1].deltaMs).toBeCloseTo(50)
    const shifted = alignEvents(markers, [0.01, 0.55], -0.05, 30)
    expect(shifted[1].status).toBe('aligned')
    expect(classifyDelta(0.2, 30)).toBe('off')
    expect(nearestOnset([], 1)).toBeNull()
    expect(suggestOffset(markers.slice(0, 2), [0.05, 0.55])).toBeCloseTo(-0.05)
    expect(suggestOffset([], [1])).toBeNull()
  })
})

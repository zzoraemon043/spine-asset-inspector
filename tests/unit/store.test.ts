import { beforeEach, describe, expect, it } from 'vitest'
import { appendEvents, dismissNotice, pushNotice, resetInspectorStore, useInspectorStore } from '../../src/store/inspectorStore'
import { EVENT_LOG_LIMIT, createLayer } from '../../src/store/defaults'
import type { EventRecord } from '../../src/core/types'

function record(id: number): EventRecord {
  return { id, kind: 'custom', name: 'step', animation: 'walk', track: 0, animationTime: 0, wallTime: id, intValue: 0, floatValue: 0, stringValue: '', audioPath: null, volume: 1, balance: 0 }
}

beforeEach(() => resetInspectorStore())

describe('inspector store', () => {
  it('caps the event log', () => {
    appendEvents(Array.from({ length: EVENT_LOG_LIMIT + 25 }, (_, i) => record(i)))
    const log = useInspectorStore.getState().eventLog
    expect(log).toHaveLength(EVENT_LOG_LIMIT)
    expect(log[0].id).toBe(25)
    appendEvents([])
    expect(useInspectorStore.getState().eventLog).toHaveLength(EVENT_LOG_LIMIT)
  })

  it('keeps at most five notices and dismisses by id', () => {
    const ids = Array.from({ length: 7 }, (_, i) => pushNotice('info', `n${i}`))
    expect(useInspectorStore.getState().notices.map((notice) => notice.text)).toEqual(['n2', 'n3', 'n4', 'n5', 'n6'])
    dismissNotice(ids[6])
    expect(useInspectorStore.getState().notices).toHaveLength(4)
  })

  it('creates default layers', () => {
    expect(createLayer(2)).toEqual({ index: 2, animation: null, loop: true, alpha: 1, blend: 'replace', enabled: true })
  })
})

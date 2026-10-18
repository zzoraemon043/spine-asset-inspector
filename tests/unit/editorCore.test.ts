import { describe, expect, it } from 'vitest'
import { applyOp, applyOps, PatchError, type PatchOp } from '../../src/core/editor/patch'
import { jsonEqual, valueAt, cloneJson, type JsonObject } from '../../src/core/editor/json'
import { EditHistory } from '../../src/core/editor/history'
import { EditSession } from '../../src/core/editor/session'
import { DocumentError, parseDocument, documentFps, type SkeletonDocument } from '../../src/core/editor/document'
import {
  deleteAnimation,
  duplicateAnimation,
  EditError,
  renameAnimation,
  renameBone,
  renameEvent,
  renameSlot,
  setBoneField,
  setEventField,
  setSkeletonFps,
  setSlotAttachment,
  setSlotBlend,
  setSlotColor,
  uniqueName,
} from '../../src/core/editor/commands'

function sampleDocument(): SkeletonDocument {
  return {
    skeleton: { hash: 'abc', spine: '4.2.0', fps: 30 },
    bones: [
      { name: 'root' },
      { name: 'hip', parent: 'root', y: 10 },
      { name: 'arm', parent: 'hip', length: 20 },
      { name: 'target', parent: 'root' },
    ],
    slots: [
      { name: 'body', bone: 'hip', attachment: 'body' },
      { name: 'hand', bone: 'arm', attachment: 'hand', blend: 'additive' },
      { name: 'clip', bone: 'root', attachment: 'clip' },
    ],
    ik: [{ name: 'reach', bones: ['arm'], target: 'target' }],
    transform: [{ name: 'follow', bones: ['arm', 'hip'], target: 'target' }],
    path: [{ name: 'rail', bones: ['arm'], target: 'hand' }],
    physics: [{ name: 'sway', bone: 'arm' }],
    skins: [
      {
        name: 'default',
        bones: ['arm'],
        attachments: {
          body: { body: { width: 10, height: 10 } },
          hand: { hand: { width: 4, height: 4 }, fist: { width: 4, height: 4 } },
          clip: { clip: { type: 'clipping', end: 'hand', vertices: [0, 0, 1, 0, 1, 1] } },
        },
      },
    ],
    events: { hit: { int: 1 }, step: { string: 'stone' } },
    animations: {
      idle: {
        bones: { arm: { rotate: [{ value: 5 }] }, hip: { translate: [{ x: 1 }] } },
        slots: { hand: { attachment: [{ name: 'fist' }] } },
        attachments: { default: { hand: { hand: { deform: [{ time: 0 }] } } } },
        drawOrder: [{ time: 0.5, offsets: [{ slot: 'hand', offset: -1 }] }],
        events: [{ time: 0.2, name: 'hit' }, { time: 0.4, name: 'step' }],
      },
      walk: { bones: { arm: { rotate: [{ value: 10 }] } } },
    },
  }
}

describe('patch operations', () => {
  it('sets, deletes and restores object keys in their original order', () => {
    const doc: JsonObject = { a: 1, b: 2, c: 3 }
    const removed = applyOp(doc, { kind: 'set', path: ['b'], value: undefined })
    expect(Object.keys(removed.document)).toEqual(['a', 'c'])
    const restored = applyOps(removed.document, removed.inverse)
    expect(Object.keys(restored.document)).toEqual(['a', 'b', 'c'])
    expect(jsonEqual(restored.document, doc)).toBe(true)
    expect(doc).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('is copy-on-write and shares untouched branches', () => {
    const doc: JsonObject = { left: { value: 1 }, right: { value: 2 } }
    const result = applyOp(doc, { kind: 'set', path: ['left', 'value'], value: 9 })
    expect(result.document.right).toBe(doc.right)
    expect(result.document.left).not.toBe(doc.left)
    expect(valueAt(doc, ['left', 'value'])).toBe(1)
  })

  it('inserts at a position and inverts insert, remove and rename', () => {
    const doc: JsonObject = { list: [1, 2, 3], map: { x: 1, y: 2, z: 3 } }
    const ops: PatchOp[] = [
      { kind: 'insert', path: ['list', 1], value: 9 },
      { kind: 'remove', path: ['list', 3] },
      { kind: 'rename', path: ['map'], from: 'y', to: 'w' },
      { kind: 'set', path: ['map', 'q'], value: 0, position: 1 },
      { kind: 'set', path: ['list', 0], value: 7 },
    ]
    const result = applyOps(doc, ops)
    expect(result.document).toEqual({ list: [7, 9, 2], map: { x: 1, q: 0, w: 2, z: 3 } })
    expect(Object.keys(result.document.map as JsonObject)).toEqual(['x', 'q', 'w', 'z'])
    const back = applyOps(result.document, result.inverse)
    expect(jsonEqual(back.document, doc)).toBe(true)
  })

  it('rejects invalid paths and operations', () => {
    const doc: JsonObject = { list: [1], map: { a: 1, b: 2 } }
    expect(() => applyOp(doc, { kind: 'set', path: ['missing', 'x'], value: 1 })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'set', path: ['list', 5], value: 1 })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'set', path: ['list', 0], value: undefined })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'insert', path: ['map', 0], value: 1 })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'remove', path: ['list', 3] })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'rename', path: ['map'], from: 'a', to: 'b' })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'rename', path: ['map'], from: 'x', to: 'y' })).toThrow(PatchError)
    expect(() => applyOp(doc, { kind: 'set', path: [], value: undefined })).toThrow(PatchError)
    expect(applyOp(doc, { kind: 'rename', path: ['map'], from: 'a', to: 'a' }).document).toBe(doc)
  })

  it('replaces the root and restores it', () => {
    const doc: JsonObject = { a: 1 }
    const result = applyOp(doc, { kind: 'set', path: [], value: { b: 2 } })
    expect(result.document).toEqual({ b: 2 })
    expect(applyOps(result.document, result.inverse).document).toBe(doc)
  })
})

describe('edit history', () => {
  const entry = (label: string, time: number, mergeKey: string | null = null) => ({ label, ops: [], inverse: [], mergeKey, time })

  it('tracks cursor, redo truncation and dirty state', () => {
    const history = new EditHistory()
    expect(history.dirty).toBe(false)
    history.record(entry('a', 0))
    history.record(entry('b', 5000))
    expect(history.index).toBe(2)
    expect(history.dirty).toBe(true)
    history.markSaved()
    expect(history.dirty).toBe(false)
    expect(history.undo()?.label).toBe('b')
    expect(history.dirty).toBe(true)
    expect(history.canRedo).toBe(true)
    history.record(entry('c', 9000))
    expect(history.canRedo).toBe(false)
    expect(history.savedIndex).toBeNull()
    expect(history.list().map((item) => item.label)).toEqual(['a', 'c'])
    expect(history.undo()?.label).toBe('c')
    expect(history.redo()?.label).toBe('c')
    expect(history.redo()).toBeNull()
    history.clear()
    expect(history.size).toBe(0)
    expect(history.dirty).toBe(false)
  })

  it('merges consecutive edits with the same key inside the window but not across a save', () => {
    const history = new EditHistory({ mergeWindow: 1000 })
    history.record({ label: 'x 1', ops: [{ kind: 'set', path: ['x'], value: 1 }], inverse: [{ kind: 'set', path: ['x'], value: 0 }], mergeKey: 'x', time: 0 })
    history.record({ label: 'x 2', ops: [{ kind: 'set', path: ['x'], value: 2 }], inverse: [{ kind: 'set', path: ['x'], value: 1 }], mergeKey: 'x', time: 500 })
    expect(history.size).toBe(1)
    expect(history.list()[0].label).toBe('x 2')
    expect(history.list()[0].inverse.map((op) => (op.kind === 'set' ? op.value : null))).toEqual([1, 0])
    history.record(entry('x 3', 3000, 'x'))
    expect(history.size).toBe(2)
    history.markSaved()
    history.record(entry('x 4', 3100, 'x'))
    expect(history.size).toBe(3)
  })

  it('drops the oldest entries beyond the limit', () => {
    const history = new EditHistory({ limit: 3 })
    history.markSaved()
    for (let index = 0; index < 5; index += 1) history.record(entry(`e${index}`, index * 5000))
    expect(history.list().map((item) => item.label)).toEqual(['e2', 'e3', 'e4'])
    expect(history.index).toBe(3)
    expect(history.savedIndex).toBeNull()
    expect(history.dirty).toBe(true)
  })
})

describe('edit session', () => {
  it('executes, undoes, redoes and jumps while notifying listeners', () => {
    let clock = 0
    const session = new EditSession(sampleDocument(), { now: () => (clock += 5000) })
    const seen: number[] = []
    const unsubscribe = session.subscribe((_document, state) => seen.push(state.revision))
    expect(session.execute(setBoneField(session.document, 'hip', 'x', 12))).toBe(true)
    expect(session.execute(renameBone(session.document, 'arm', 'forearm'))).toBe(true)
    expect(session.execute({ label: 'noop', ops: [] })).toBe(false)
    expect(session.state()).toMatchObject({ canUndo: true, canRedo: false, dirty: true, undoLabel: '重新命名骨骼 arm 為 forearm', index: 2 })
    expect(session.undo()).toBe(true)
    expect(valueAt(session.document, ['bones', 2, 'name'])).toBe('arm')
    expect(session.state().redoLabel).toBe('重新命名骨骼 arm 為 forearm')
    expect(session.redo()).toBe(true)
    expect(session.jump(0)).toBe(true)
    expect(jsonEqual(session.document, session.original)).toBe(true)
    expect(session.state().dirty).toBe(false)
    expect(session.jump(0)).toBe(false)
    expect(session.jump(2)).toBe(true)
    expect(valueAt(session.document, ['bones', 1, 'x'])).toBe(12)
    session.markSaved()
    expect(session.state()).toMatchObject({ dirty: false, savedIndex: 2 })
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(false)
    expect(session.redo()).toBe(true)
    unsubscribe()
    expect(seen.length).toBeGreaterThanOrEqual(8)
    expect(session.revision).toBe(9)
  })
})

describe('domain commands', () => {
  it('edits bone setup values and skips writing unchanged defaults', () => {
    const doc = sampleDocument()
    const command = setBoneField(doc, 'arm', 'rotation', 45)
    expect(command.mergeKey).toBe('bone:arm:rotation')
    expect(applyOps(doc, command.ops).document.bones).toContainEqual({ name: 'arm', parent: 'hip', length: 20, rotation: 45 })
    expect(setBoneField(doc, 'arm', 'scaleX', 1).ops).toEqual([])
    expect(setBoneField(doc, 'hip', 'y', 10).ops).toEqual([])
    expect(() => setBoneField(doc, 'nope', 'x', 1)).toThrow(EditError)
    expect(() => setBoneField(doc, 'arm', 'x', Number.NaN)).toThrow(EditError)
    expect(() => setBoneField(doc, 'arm', 'length', -1)).toThrow('骨骼長度不可小於 0')
  })

  it('renames a bone and every reference to it', () => {
    const doc = sampleDocument()
    const command = renameBone(doc, 'arm', 'forearm')
    const next = applyOps(doc, command.ops).document as any
    expect(next.bones[2].name).toBe('forearm')
    expect(next.slots[1].bone).toBe('forearm')
    expect(next.ik[0].bones).toEqual(['forearm'])
    expect(next.transform[0].bones).toEqual(['forearm', 'hip'])
    expect(next.path[0].bones).toEqual(['forearm'])
    expect(next.physics[0].bone).toBe('forearm')
    expect(next.skins[0].bones).toEqual(['forearm'])
    expect(Object.keys(next.animations.idle.bones)).toEqual(['forearm', 'hip'])
    expect(Object.keys(next.animations.walk.bones)).toEqual(['forearm'])
    const renamedTarget = applyOps(doc, renameBone(doc, 'target', 'goal').ops).document as any
    expect(renamedTarget.ik[0].target).toBe('goal')
    expect(renamedTarget.transform[0].target).toBe('goal')
    const renamedParent = applyOps(doc, renameBone(doc, 'hip', 'pelvis').ops).document as any
    expect(renamedParent.bones[2].parent).toBe('pelvis')
    expect(renameBone(doc, 'arm', ' arm ').ops).toEqual([])
    expect(() => renameBone(doc, 'arm', 'hip')).toThrow('骨骼名稱已存在：hip')
    expect(() => renameBone(doc, 'arm', '  ')).toThrow('骨骼名稱不可空白')
    expect(() => renameBone(doc, 'arm', 'x'.repeat(200))).toThrow(EditError)
  })

  it('renames a slot including skins, clipping ends, path targets and animation timelines', () => {
    const doc = sampleDocument()
    const next = applyOps(doc, renameSlot(doc, 'hand', 'palm').ops).document as any
    expect(next.slots[1].name).toBe('palm')
    expect(Object.keys(next.skins[0].attachments)).toEqual(['body', 'palm', 'clip'])
    expect(next.skins[0].attachments.clip.clip.end).toBe('palm')
    expect(next.path[0].target).toBe('palm')
    expect(Object.keys(next.animations.idle.slots)).toEqual(['palm'])
    expect(Object.keys(next.animations.idle.attachments.default)).toEqual(['palm'])
    expect(next.animations.idle.drawOrder[0].offsets[0].slot).toBe('palm')
    expect(renameSlot(doc, 'hand', 'hand').ops).toEqual([])
    expect(() => renameSlot(doc, 'hand', 'body')).toThrow(EditError)
  })

  it('edits slot colors, default attachment and blend mode', () => {
    const doc = sampleDocument()
    expect(applyOps(doc, setSlotColor(doc, 'body', 'color', '#FF000080').ops).document.slots).toContainEqual({ name: 'body', bone: 'hip', attachment: 'body', color: 'ff000080' })
    expect(setSlotColor(doc, 'body', 'color', 'ffffffff').ops).toEqual([])
    expect(applyOps(doc, setSlotColor(doc, 'body', 'dark', '102030').ops).document.slots).toContainEqual({ name: 'body', bone: 'hip', attachment: 'body', dark: '102030' })
    expect(() => setSlotColor(doc, 'body', 'color', 'red')).toThrow(EditError)
    expect(() => setSlotColor(doc, 'body', 'dark', 'ffffffff')).toThrow(EditError)
    expect(applyOps(doc, setSlotAttachment(doc, 'hand', 'fist').ops).document.slots).toContainEqual({ name: 'hand', bone: 'arm', attachment: 'fist', blend: 'additive' })
    expect(applyOps(doc, setSlotAttachment(doc, 'hand', null).ops).document.slots).toContainEqual({ name: 'hand', bone: 'arm', blend: 'additive' })
    expect(() => setSlotAttachment(doc, 'hand', 'body')).toThrow('插槽 hand 沒有部件：body')
    expect(applyOps(doc, setSlotBlend(doc, 'hand', 'screen').ops).document.slots).toContainEqual({ name: 'hand', bone: 'arm', attachment: 'hand', blend: 'screen' })
    expect(setSlotBlend(doc, 'body', 'normal').ops).toEqual([])
    expect(() => setSlotBlend(doc, 'body', 'overlay')).toThrow(EditError)
  })

  it('renames events and edits their defaults', () => {
    const doc = sampleDocument()
    const next = applyOps(doc, renameEvent(doc, 'hit', 'impact').ops).document as any
    expect(Object.keys(next.events)).toEqual(['impact', 'step'])
    expect(next.animations.idle.events.map((key: any) => key.name)).toEqual(['impact', 'step'])
    expect(() => renameEvent(doc, 'hit', 'step')).toThrow(EditError)
    expect(renameEvent(doc, 'hit', 'hit').ops).toEqual([])
    expect((applyOps(doc, setEventField(doc, 'hit', 'float', 2.5).ops).document as any).events.hit).toEqual({ int: 1, float: 2.5 })
    expect((applyOps(doc, setEventField(doc, 'step', 'string', 'grass').ops).document as any).events.step).toEqual({ string: 'grass' })
    expect(setEventField(doc, 'hit', 'volume', 1).ops).toEqual([])
    expect(() => setEventField(doc, 'hit', 'int', 1.5)).toThrow('整數欄位不可有小數')
    expect(() => setEventField(doc, 'hit', 'balance', 3)).toThrow(EditError)
    expect(() => setEventField(doc, 'hit', 'volume', -1)).toThrow(EditError)
    expect(() => setEventField(doc, 'hit', 'string', 5)).toThrow(EditError)
    expect(() => setEventField(doc, 'missing', 'int', 1)).toThrow('找不到事件：missing')
  })

  it('renames, duplicates and deletes animations keeping key order', () => {
    const doc = sampleDocument()
    expect(Object.keys((applyOps(doc, renameAnimation(doc, 'idle', 'rest').ops).document as any).animations)).toEqual(['rest', 'walk'])
    const duplicated = applyOps(doc, duplicateAnimation(doc, 'idle').ops).document as any
    expect(Object.keys(duplicated.animations)).toEqual(['idle', 'idle 複本', 'walk'])
    expect(duplicated.animations['idle 複本']).toEqual(doc.animations && (doc.animations as any).idle)
    expect(duplicated.animations['idle 複本']).not.toBe((doc.animations as any).idle)
    expect(Object.keys((applyOps(duplicated, duplicateAnimation(duplicated, 'idle').ops).document as any).animations)).toContain('idle 複本 2')
    expect(Object.keys((applyOps(doc, duplicateAnimation(doc, 'walk', 'run').ops).document as any).animations)).toEqual(['idle', 'walk', 'run'])
    const removed = applyOps(doc, deleteAnimation(doc, 'idle').ops)
    expect(Object.keys((removed.document as any).animations)).toEqual(['walk'])
    expect(Object.keys((applyOps(removed.document, removed.inverse).document as any).animations)).toEqual(['idle', 'walk'])
    expect(() => renameAnimation(doc, 'idle', 'walk')).toThrow(EditError)
    expect(renameAnimation(doc, 'idle', 'idle').ops).toEqual([])
    expect(() => deleteAnimation(doc, 'nope')).toThrow(EditError)
    expect(uniqueName('a', ['b'])).toBe('a')
  })

  it('edits the skeleton frame rate', () => {
    const doc = sampleDocument()
    expect(documentFps(applyOps(doc, setSkeletonFps(doc, 24).ops).document)).toBe(24)
    expect(() => setSkeletonFps(doc, 0)).toThrow(EditError)
    const bare: SkeletonDocument = { bones: [] }
    const created = applyOps(bare, setSkeletonFps(bare, 60).ops).document
    expect(Object.keys(created)).toEqual(['skeleton', 'bones'])
    expect(documentFps(created)).toBe(60)
    expect(documentFps(bare)).toBeNull()
  })

  it('fully reverts any chain of commands through their inverses', () => {
    const doc = sampleDocument()
    const session = new EditSession(cloneJson(doc))
    session.execute(renameSlot(session.document, 'hand', 'palm'))
    session.execute(renameBone(session.document, 'arm', 'forearm'))
    session.execute(renameEvent(session.document, 'step', 'footstep'))
    session.execute(duplicateAnimation(session.document, 'idle'))
    session.execute(deleteAnimation(session.document, 'walk'))
    session.execute(setSlotColor(session.document, 'palm', 'color', '00ff00ff'))
    session.jump(0)
    expect(jsonEqual(session.document, doc)).toBe(true)
    expect(JSON.stringify(session.document)).toBe(JSON.stringify(doc))
  })
})

describe('document parsing', () => {
  it('parses objects and rejects invalid input', () => {
    expect(parseDocument('{"bones":[]}')).toEqual({ bones: [] })
    expect(() => parseDocument('[1]')).toThrow(DocumentError)
    expect(() => parseDocument('{bad')).toThrow('JSON 格式錯誤')
  })
})

import { describe, expect, it } from 'vitest'
import { TextureAtlas, type SkeletonData } from '@esotericsoftware/spine-core'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import { buildSkeleton } from '../../src/core/spine/skeletonFactory'
import { readSkeletonData, serializeDocument } from '../../src/core/editor/serialize'
import { DocumentError, parseDocument } from '../../src/core/editor/document'
import { EditSession } from '../../src/core/editor/session'
import { deleteAnimation, renameAnimation, renameBone, renameSlot, setBoneField, setSlotColor } from '../../src/core/editor/commands'
import { FakeTexture, buildDemo } from '../support/fakeTexture'
import { buildSpine36Fixture, FIXTURE_ATLAS } from '../support/spine36Writer'

function fingerprint(data: SkeletonData) {
  return {
    bones: data.bones.map((bone) => [bone.name, bone.parent?.name ?? null, bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY, bone.shearX, bone.shearY, bone.length, bone.inherit]),
    slots: data.slots.map((slot) => [slot.name, slot.boneData.name, slot.attachmentName, slot.blendMode, slot.color.toString()]),
    skins: data.skins.map((skin) => [skin.name, skin.getAttachments().map((entry) => `${entry.slotIndex}:${entry.name}`).sort()]),
    events: data.events.map((event) => [event.name, event.intValue, event.floatValue, event.stringValue]),
    animations: data.animations.map((animation) => [animation.name, animation.duration, animation.timelines.length, animation.timelines.map((timeline) => [timeline.constructor.name, ...timeline.frames])]),
    ik: data.ikConstraints.map((constraint) => constraint.name),
    fps: data.fps,
  }
}

function demoAtlas(): TextureAtlas {
  const atlas = new TextureAtlas(createDemoFiles().atlasText)
  for (const page of atlas.pages) page.setTexture(new FakeTexture(page.width, page.height))
  return atlas
}

describe('lossless document serialization', () => {
  it('keeps the demo JSON byte-identical through load and serialize', () => {
    const files = createDemoFiles()
    const build = buildDemo()
    expect(build.document).not.toBeNull()
    expect(build.documentReason).toBeNull()
    expect(serializeDocument(build.document!)).toBe(files.skeletonJson)
    expect(parseDocument(serializeDocument(build.document!, { pretty: true }))).toEqual(build.document)
  })

  it('produces runtime-equivalent skeleton data from the document', () => {
    const build = buildDemo()
    const rebuilt = readSkeletonData(build.document!, demoAtlas(), 'demo')
    expect(fingerprint(rebuilt)).toEqual(fingerprint(build.data))
  })

  it('upgrades 3.6 binaries into an editable 4.2 document that round-trips', () => {
    const atlas = () => {
      const result = new TextureAtlas(FIXTURE_ATLAS)
      for (const page of result.pages) page.setTexture(new FakeTexture(64, 64))
      return result
    }
    const build = buildSkeleton(
      {
        name: 'fixture',
        origin: 'local',
        skeleton: { fileName: 'fixture.skel', format: 'binary', data: buildSpine36Fixture() },
        atlasText: FIXTURE_ATLAS,
        pages: new Map([['fixture.png', { width: 64, height: 64 }]]),
        skeletonCandidates: [],
        warnings: [],
      },
      () => new FakeTexture(64, 64),
    )
    expect(build.legacy).not.toBeNull()
    expect((build.document!.skeleton as { spine: string }).spine).toBe('4.2.0')
    const text = serializeDocument(build.document!)
    expect(fingerprint(readSkeletonData(parseDocument(text), atlas()))).toEqual(fingerprint(build.data))
  })

  it('reflects edits in the parsed runtime data and restores the original after undo', () => {
    const build = buildDemo()
    const session = new EditSession(build.document!)
    const bone = build.data.bones[3].name
    const slot = build.data.slots[0].name
    const animation = build.data.animations[0].name
    session.execute(setBoneField(session.document, bone, 'rotation', 33))
    session.execute(renameBone(session.document, bone, 'renamed-bone'))
    session.execute(renameSlot(session.document, slot, 'renamed-slot'))
    session.execute(setSlotColor(session.document, 'renamed-slot', 'color', '80808080'))
    session.execute(renameAnimation(session.document, animation, 'renamed-animation'))
    session.execute(deleteAnimation(session.document, build.data.animations[1].name))
    const edited = readSkeletonData(session.document, demoAtlas())
    expect(edited.findBone('renamed-bone')?.rotation).toBe(33)
    expect(edited.findBone(bone)).toBeNull()
    expect(edited.findSlot('renamed-slot')?.boneData.name).toBe(build.data.slots[0].boneData.name === bone ? 'renamed-bone' : build.data.slots[0].boneData.name)
    expect(edited.findSlot('renamed-slot')?.color.a).toBeCloseTo(128 / 255)
    expect(edited.findAnimation('renamed-animation')?.duration).toBe(build.data.animations[0].duration)
    expect(edited.animations.length).toBe(build.data.animations.length - 1)
    expect(edited.skins.flatMap((skin) => skin.getAttachments()).length).toBe(build.data.skins.flatMap((skin) => skin.getAttachments()).length)
    session.jump(0)
    expect(serializeDocument(session.document)).toBe(createDemoFiles().skeletonJson)
  })

  it('reports documents the runtime cannot read', () => {
    expect(() => readSkeletonData({ bones: [{ name: 'a' }], slots: [{ name: 's', bone: 'missing' }] }, demoAtlas())).toThrow(DocumentError)
  })
})

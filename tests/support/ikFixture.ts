import { createDemoFiles, createDemoSource } from '../../src/core/demo/demoAsset'
import type { AssetSource, TexturePixels } from '../../src/core/types'

export const IK_FIXTURE_NAME = 'ik-demo'

export function ikFixtureJson(): Record<string, any> {
  const json = JSON.parse(createDemoFiles().skeletonJson)
  const bones = json.bones as Array<Record<string, unknown>>
  const lower = bones.find((bone) => bone.name === 'arm-front-lower')
  bones.push({ name: 'aim', parent: 'root', x: 60, y: 180, color: 'ff3d6eff' })
  json.ik = [{ name: 'arm-ik', bones: ['arm-front-upper', 'arm-front-lower'], target: 'aim', mix: 1, order: 0 }]
  json.transform = [{ name: 'cape-follow', bones: ['arm-back-upper'], target: 'head', mixRotate: 0.5, mixX: 0, mixScaleX: 0, mixShearY: 0, order: 1 }]
  if (lower && typeof lower.length !== 'number') lower.length = 40
  return json
}

export function ikFixtureSource(): AssetSource<TexturePixels> {
  const base = createDemoSource((pixels) => pixels)
  return { ...base, name: IK_FIXTURE_NAME, origin: 'local', skeleton: { fileName: `${IK_FIXTURE_NAME}.json`, format: 'json', data: JSON.stringify(ikFixtureJson()) } }
}

import { Texture, type TextureFilter, type TextureWrap } from '@esotericsoftware/spine-core'
import type { AssetSource, TexturePixels } from '../../src/core/types'
import { createDemoSource } from '../../src/core/demo/demoAsset'
import { buildSkeleton, type SkeletonBuild } from '../../src/core/spine/skeletonFactory'

export class FakeTexture extends Texture {
  constructor(width: number, height: number) {
    super({ width, height } as unknown as ImageBitmap)
  }
  setFilters(_min: TextureFilter, _mag: TextureFilter): void {}
  setWraps(_u: TextureWrap, _v: TextureWrap): void {}
  dispose(): void {}
}

export function demoSource(): AssetSource<TexturePixels> {
  return createDemoSource((pixels) => pixels)
}

export function buildDemo(): SkeletonBuild {
  return buildSkeleton(demoSource(), (image) => new FakeTexture(image.width, image.height))
}

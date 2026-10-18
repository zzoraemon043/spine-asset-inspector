import { createDemoFiles } from '../../src/core/demo/demoAsset'
import { createVirtualFile } from '../../src/core/assets/virtualFile'
import type { VirtualFile } from '../../src/core/types'
import { encodePng } from '../../src/core/image/pngEncode'

export { encodePng }

export interface DemoFileSet {
  readonly json: Uint8Array
  readonly atlas: Uint8Array
  readonly png: Uint8Array
  readonly names: { readonly json: string; readonly atlas: string; readonly png: string }
}

export function demoFileSet(): DemoFileSet {
  const files = createDemoFiles()
  const encoder = new TextEncoder()
  return {
    json: encoder.encode(files.skeletonJson),
    atlas: encoder.encode(files.atlasText),
    png: encodePng(files.texture),
    names: { json: files.skeletonFileName, atlas: files.atlasFileName, png: files.pageName },
  }
}

export function demoVirtualFiles(prefix = ''): VirtualFile[] {
  const set = demoFileSet()
  return [
    createVirtualFile(`${prefix}${set.names.json}`, set.json),
    createVirtualFile(`${prefix}${set.names.atlas}`, set.atlas),
    createVirtualFile(`${prefix}${set.names.png}`, set.png),
  ]
}

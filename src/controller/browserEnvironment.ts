import { buildLocalSource, decodeTexture, pixelsToBitmap } from '@/core/assets/browserFiles'
import { readImagePixels } from '@/core/image/pixelReader'
import { createWebAudioBackend } from './audioBackend'
import { createDemoFiles } from '@/core/demo/demoAsset'
import { downloadBlob } from '@/core/export/download'
import { ExportPreviewer, exportPngSequence, exportScreenshot, exportSpriteSheet, exportWebm } from '@/core/export/exporters'
import { supportsWebmRecording } from '@/core/export/webm'
import type { AssetSource } from '@/core/types'
import type { ControllerEnvironment } from './types'

async function demoSource(): Promise<AssetSource<ImageBitmap>> {
  const files = createDemoFiles()
  const bitmap = await pixelsToBitmap(files.texture)
  return {
    name: 'inspector-demo',
    origin: 'demo',
    skeleton: { fileName: files.skeletonFileName, format: 'json', data: files.skeletonJson },
    atlasText: files.atlasText,
    pages: new Map([[files.pageName, bitmap]]),
    skeletonCandidates: [files.skeletonFileName],
    warnings: [],
  }
}

export function createBrowserEnvironment(): ControllerEnvironment<ImageBitmap> {
  const previewer = new ExportPreviewer()
  return {
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    createDemoSource: demoSource,
    createLocalSource: (files, preferred) => buildLocalSource(files, preferred),
    releaseSource: (source) => {
      for (const bitmap of source.pages.values()) bitmap.close()
    },
    exporter: {
      screenshot: (context, pose, output) => exportScreenshot(context, pose, output),
      sequence: (context, job, onProgress, signal) => exportPngSequence(context, job, onProgress, signal),
      sheet: (context, job, onProgress, signal) => exportSpriteSheet(context, job, onProgress, signal),
      webm: (context, job, onProgress, signal) => exportWebm(context, job, onProgress, signal),
      supportsWebm: supportsWebmRecording,
      save: downloadBlob,
      preview: async (context, request, pose) => previewer.render(context, request, pose),
      disposePreview: () => previewer.dispose(),
    },
    imaging: {
      readPixels: (image) => readImagePixels(image),
      decode: (file) => decodeTexture(file),
      size: (image) => ({ width: image.width, height: image.height }),
      release: (image) => image.close(),
    },
    audio: createWebAudioBackend(),
  }
}

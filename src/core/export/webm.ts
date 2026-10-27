const CANDIDATE_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const

export function pickWebmMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of CANDIDATE_TYPES) if (isSupported(type)) return type
  return null
}

export function supportsWebmRecording(): boolean {
  return typeof MediaRecorder !== 'undefined' && pickWebmMimeType((type) => MediaRecorder.isTypeSupported(type)) !== null
}

export interface WebmSession {
  readonly mimeType: string
  pushFrame(): void
  finish(): Promise<Blob>
}

function createRecordingCanvas(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; copy(): void; release(): void } {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.position = 'fixed'
  canvas.style.left = '0'
  canvas.style.top = '0'
  canvas.style.width = '1px'
  canvas.style.height = '1px'
  canvas.style.opacity = '0'
  canvas.style.pointerEvents = 'none'
  document.body.append(canvas)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法建立錄影用畫布')
  return {
    canvas,
    copy: () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0)
    },
    release: () => canvas.remove(),
  }
}

const ENCODER_SETTLE_MS = 250

const START_TIMEOUT_MS = 1000

const settle = () => new Promise((resolve) => setTimeout(resolve, ENCODER_SETTLE_MS))

export async function startWebmSession(source: HTMLCanvasElement, bitsPerSecond: number): Promise<WebmSession> {
  const mimeType = pickWebmMimeType((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('此瀏覽器不支援 WebM 錄製')
  const recording = createRecordingCanvas(source)
  const stream = recording.canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  if (!track) {
    recording.release()
    throw new Error('無法擷取畫布影像串流')
  }
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, START_TIMEOUT_MS)
    recorder.onstart = () => {
      clearTimeout(timer)
      resolve()
    }
    recorder.start(100)
    recording.copy()
    track.requestFrame()
  })
  return {
    mimeType,
    pushFrame: () => {
      recording.copy()
      track.requestFrame()
    },
    finish: async () => {
      await settle()
      return new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          track.stop()
          recording.release()
          resolve(new Blob(chunks, { type: 'video/webm' }))
        }
        recorder.onerror = () => {
          recording.release()
          reject(new Error('WebM 錄製失敗'))
        }
        recorder.stop()
      })
    },
  }
}

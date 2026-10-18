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

export function startWebmSession(canvas: HTMLCanvasElement, bitsPerSecond: number): WebmSession {
  const mimeType = pickWebmMimeType((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('此瀏覽器不支援 WebM 錄製')
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  if (!track) throw new Error('無法擷取畫布影像串流')
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start()
  return {
    mimeType,
    pushFrame: () => track.requestFrame(),
    finish: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          track.stop()
          resolve(new Blob(chunks, { type: 'video/webm' }))
        }
        recorder.onerror = () => reject(new Error('WebM 錄製失敗'))
        recorder.stop()
      }),
  }
}

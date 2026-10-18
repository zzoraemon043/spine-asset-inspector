export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type GizmoHandle = 'move' | 'move-x' | 'move-y' | 'rotate' | 'scale' | 'scale-x' | 'scale-y'
export type SetupField = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'
export type SetupValues = Readonly<Record<SetupField, number>>
export type SetupPatch = Partial<SetupValues>

export interface Vec {
  readonly x: number
  readonly y: number
}

export interface Affine {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly x: number
  readonly y: number
}

export interface BonePose {
  readonly name: string
  readonly world: Affine
  readonly parent: Affine
  readonly length: number
  readonly setup: SetupValues
}

export const GIZMO_MODES: readonly GizmoMode[] = ['translate', 'rotate', 'scale']

export const GIZMO_MODE_LABEL: Record<GizmoMode, string> = { translate: '位移', rotate: '旋轉', scale: '縮放' }

export const HANDLE_LABEL: Record<GizmoHandle, string> = {
  move: '自由移動',
  'move-x': '沿 X 軸移動',
  'move-y': '沿 Y 軸移動',
  rotate: '旋轉',
  scale: '等比縮放',
  'scale-x': '縮放 X',
  'scale-y': '縮放 Y',
}

export const HANDLE_FIELDS: Record<GizmoHandle, readonly SetupField[]> = {
  move: ['x', 'y'],
  'move-x': ['x'],
  'move-y': ['y'],
  rotate: ['rotation'],
  scale: ['scaleX', 'scaleY'],
  'scale-x': ['scaleX'],
  'scale-y': ['scaleY'],
}

import type { SetupField, SetupValues } from '../gizmo/types'
import { roundValue, type KeyableChannel } from './channels'

export const CHANNEL_FIELDS: Record<KeyableChannel, readonly SetupField[]> = {
  translate: ['x', 'y'],
  rotate: ['rotation'],
  scale: ['scaleX', 'scaleY'],
}

export function channelForField(field: SetupField): KeyableChannel {
  return field === 'x' || field === 'y' ? 'translate' : field === 'rotation' ? 'rotate' : 'scale'
}

function ratio(value: number, base: number): number {
  return Math.abs(base) < 1e-9 ? value : value / base
}

export function channelValues(channel: KeyableChannel, setup: SetupValues, pose: SetupValues): number[] {
  if (channel === 'translate') return [roundValue(pose.x - setup.x), roundValue(pose.y - setup.y)]
  if (channel === 'rotate') return [roundValue(pose.rotation - setup.rotation)]
  return [roundValue(ratio(pose.scaleX, setup.scaleX)), roundValue(ratio(pose.scaleY, setup.scaleY))]
}

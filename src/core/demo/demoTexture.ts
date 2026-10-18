import type { TexturePixels } from '../types'
import type { PackedRegion } from './demoRegions'

type Rgb = readonly [number, number, number]

function shade(color: Rgb, factor: number): Rgb {
  return [
    Math.round(Math.min(255, Math.max(0, color[0] * factor))),
    Math.round(Math.min(255, Math.max(0, color[1] * factor))),
    Math.round(Math.min(255, Math.max(0, color[2] * factor))),
  ]
}

function insideRounded(px: number, py: number, w: number, h: number, r: number): boolean {
  const cx = px < r ? r : px > w - r ? w - r : px
  const cy = py < r ? r : py > h - r ? h - r : py
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function regionPixel(region: PackedRegion, lx: number, ly: number): readonly [number, number, number, number] | null {
  const w = region.width
  const h = region.height
  const px = lx + 0.5
  const py = ly + 0.5
  const radius = region.style === 'blade' ? 3 : region.style === 'head' ? Math.min(w, h) * 0.45 : Math.min(6, Math.min(w, h) / 3)
  if (!insideRounded(px, py, w, h, radius)) return null
  const border = 2
  const edge = !insideRounded(px - border, py - border, w - border * 2, h - border * 2, Math.max(0, radius - border)) || px < border || py < border || px > w - border || py > h - border
  const base = region.color
  if (edge) return [...shade(base, 0.55), 255]
  if (region.style === 'head') {
    const ex = w * 0.7
    const ey = h * 0.66
    if ((px - ex) ** 2 + (py - ey) ** 2 <= 16) return [24, 24, 32, 255]
  }
  if (region.style === 'blade' && py < h * 0.4) return [...shade(base, 1.08), 255]
  if (region.style === 'gun' && px > w * 0.75 && py < h * 0.55) return [...shade(base, 0.7), 255]
  if (region.style === 'cloth') {
    const stripe = Math.floor(px / 10) % 2 === 0
    return [...shade(base, stripe ? 1 : 0.86), 235]
  }
  if (region.style === 'helmet' && px > w * 0.55 && px < w * 0.7) return [...shade(base, 0.75), 255]
  const highlight = py < h * 0.3 ? 1.15 : py > h * 0.75 ? 0.88 : 1
  return [...shade(base, highlight), 255]
}

export function paintAtlasPage(width: number, height: number, regions: readonly PackedRegion[]): TexturePixels {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (const region of regions) {
    for (let ly = 0; ly < region.height; ly++) {
      for (let lx = 0; lx < region.width; lx++) {
        const color = regionPixel(region, lx, ly)
        if (!color) continue
        const offset = ((region.y + ly) * width + region.x + lx) * 4
        pixels[offset] = color[0]
        pixels[offset + 1] = color[1]
        pixels[offset + 2] = color[2]
        pixels[offset + 3] = color[3]
      }
    }
  }
  return { width, height, pixels }
}

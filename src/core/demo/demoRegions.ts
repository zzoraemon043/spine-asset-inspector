export type RegionStyle = 'panel' | 'head' | 'blade' | 'gun' | 'cloth' | 'helmet'

export interface DemoRegionSpec {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly color: readonly [number, number, number]
  readonly style: RegionStyle
}

export interface PackedRegion extends DemoRegionSpec {
  readonly x: number
  readonly y: number
}

export const DEMO_PAGE = { name: 'inspector-demo.png', width: 512, height: 256, padding: 2 } as const

export const DEMO_REGIONS: readonly DemoRegionSpec[] = [
  { name: 'torso', width: 96, height: 64, color: [79, 124, 255], style: 'panel' },
  { name: 'head', width: 64, height: 64, color: [240, 200, 160], style: 'head' },
  { name: 'arm-upper', width: 58, height: 22, color: [91, 141, 239], style: 'panel' },
  { name: 'arm-lower', width: 54, height: 20, color: [91, 141, 239], style: 'panel' },
  { name: 'arm-upper-back', width: 58, height: 22, color: [58, 91, 176], style: 'panel' },
  { name: 'arm-lower-back', width: 54, height: 20, color: [58, 91, 176], style: 'panel' },
  { name: 'hand', width: 22, height: 22, color: [240, 200, 160], style: 'panel' },
  { name: 'leg-upper', width: 74, height: 28, color: [75, 85, 99], style: 'panel' },
  { name: 'leg-lower', width: 68, height: 24, color: [75, 85, 99], style: 'panel' },
  { name: 'foot', width: 38, height: 18, color: [31, 41, 55], style: 'panel' },
  { name: 'leg-upper-back', width: 74, height: 28, color: [55, 65, 81], style: 'panel' },
  { name: 'leg-lower-back', width: 68, height: 24, color: [55, 65, 81], style: 'panel' },
  { name: 'foot-back', width: 38, height: 18, color: [17, 24, 39], style: 'panel' },
  { name: 'cape', width: 100, height: 60, color: [124, 58, 237], style: 'cloth' },
  { name: 'armor-red', width: 84, height: 70, color: [220, 38, 38], style: 'panel' },
  { name: 'armor-blue', width: 84, height: 70, color: [37, 99, 235], style: 'panel' },
  { name: 'helmet-knight', width: 46, height: 72, color: [156, 163, 175], style: 'helmet' },
  { name: 'helmet-cap', width: 30, height: 70, color: [245, 158, 11], style: 'helmet' },
  { name: 'sword', width: 110, height: 16, color: [229, 231, 235], style: 'blade' },
  { name: 'blaster', width: 70, height: 26, color: [16, 185, 129], style: 'gun' },
]

export function packRegions(regions: readonly DemoRegionSpec[], pageWidth: number, pageHeight: number, padding: number): PackedRegion[] {
  const sorted = [...regions].sort((a, b) => b.height - a.height || b.width - a.width || a.name.localeCompare(b.name))
  const packed: PackedRegion[] = []
  let cursorX = padding
  let cursorY = padding
  let shelfHeight = 0
  for (const region of sorted) {
    if (cursorX + region.width + padding > pageWidth) {
      cursorX = padding
      cursorY += shelfHeight + padding
      shelfHeight = 0
    }
    if (cursorY + region.height + padding > pageHeight) throw new Error(`示範圖集空間不足：${region.name}`)
    packed.push({ ...region, x: cursorX, y: cursorY })
    cursorX += region.width + padding
    shelfHeight = Math.max(shelfHeight, region.height)
  }
  return packed
}

export function buildAtlasText(pageName: string, width: number, height: number, regions: readonly PackedRegion[]): string {
  const lines = [pageName, `size:${width},${height}`, 'filter:Linear,Linear', 'pma:false']
  for (const region of [...regions].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(region.name, `bounds:${region.x},${region.y},${region.width},${region.height}`)
  }
  return `${lines.join('\n')}\n`
}

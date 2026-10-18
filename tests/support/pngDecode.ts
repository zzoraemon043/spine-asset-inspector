import { inflateSync } from 'node:zlib'

export interface DecodedPng {
  readonly width: number
  readonly height: number
  readonly colorType: number
  readonly pixels: Uint8Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((value, index) => bytes[index] === value)
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  if (!isPng(bytes)) throw new Error('not a png')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat: Uint8Array[] = []
  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      colorType = bytes[offset + 17]
      if (bytes[offset + 16] !== 8) throw new Error('unsupported bit depth')
    } else if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (channels === 0) throw new Error(`unsupported color type ${colorType}`)
  const raw = inflateSync(Buffer.concat(idat.map((chunk) => Buffer.from(chunk))))
  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      const value = line[x]
      let result = value
      if (filter === 1) result = value + left
      else if (filter === 2) result = value + up
      else if (filter === 3) result = value + Math.floor((left + up) / 2)
      else if (filter === 4) result = value + paeth(left, up, upLeft)
      pixels[y * stride + x] = result & 0xff
    }
  }
  return { width, height, colorType, pixels }
}

export function alphaStats(png: DecodedPng): { transparent: number; opaque: number; partial: number } {
  let transparent = 0
  let opaque = 0
  let partial = 0
  if (png.colorType !== 6) return { transparent, opaque: png.width * png.height, partial }
  for (let i = 3; i < png.pixels.length; i += 4) {
    const alpha = png.pixels[i]
    if (alpha === 0) transparent += 1
    else if (alpha === 255) opaque += 1
    else partial += 1
  }
  return { transparent, opaque, partial }
}

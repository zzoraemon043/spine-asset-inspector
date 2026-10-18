export class Spine36Writer {
  private readonly bytes: number[] = []

  byte(value: number): this {
    this.bytes.push(value & 0xff)
    return this
  }

  bool(value: boolean): this {
    return this.byte(value ? 1 : 0)
  }

  varint(value: number, optimizePositive = true): this {
    let v = optimizePositive ? value >>> 0 : ((value << 1) ^ (value >> 31)) >>> 0
    for (;;) {
      if (v < 0x80) {
        this.bytes.push(v)
        return this
      }
      this.bytes.push((v & 0x7f) | 0x80)
      v >>>= 7
    }
  }

  int32(value: number): this {
    const buffer = new DataView(new ArrayBuffer(4))
    buffer.setInt32(0, value | 0)
    for (let i = 0; i < 4; i++) this.bytes.push(buffer.getUint8(i))
    return this
  }

  float(value: number): this {
    const buffer = new DataView(new ArrayBuffer(4))
    buffer.setFloat32(0, value)
    for (let i = 0; i < 4; i++) this.bytes.push(buffer.getUint8(i))
    return this
  }

  floats(values: readonly number[]): this {
    for (const value of values) this.float(value)
    return this
  }

  short(value: number): this {
    const buffer = new DataView(new ArrayBuffer(2))
    buffer.setInt16(0, value)
    this.bytes.push(buffer.getUint8(0), buffer.getUint8(1))
    return this
  }

  str(value: string | null): this {
    if (value === null) return this.varint(0)
    const encoded = new TextEncoder().encode(value)
    this.varint(encoded.length + 1)
    for (const byte of encoded) this.bytes.push(byte)
    return this
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

export const FIXTURE_ATLAS = ['fixture.png', 'size:64,64', 'filter:Linear,Linear', 'body-region', 'bounds:0,0,20,40', 'mesh', 'bounds:20,0,10,10', ''].join('\n')

const LINEAR = 0
const STEPPED = 1
const BEZIER = 2

export function buildSpine36Fixture(version = '3.6.52'): Uint8Array {
  const w = new Spine36Writer()
  w.str('fixture-hash').str(version).float(100).float(200).bool(true).float(30).str('./images/')
  w.varint(3)
  w.str('root').floats([0, 0, 0, 1, 1, 0, 0, 0]).varint(0).int32(0xff0000ff)
  w.str('arm').varint(0).floats([0, 10, 20, 1, 1, 0, 0, 50]).varint(0).int32(0x00ff00ff)
  w.str('tip').varint(1).floats([0, 50, 0, 1, 1, 0, 0, 10]).varint(2).int32(0x0000ffff)
  w.varint(4)
  w.str('body').varint(0).int32(-1).int32(-1).str('body').varint(0)
  w.str('arm').varint(1).int32(0xff8080ff).int32(0x112233).str('mesh').varint(1)
  w.str('clip').varint(0).int32(-1).int32(-1).str(null).varint(0)
  w.str('trail').varint(2).int32(-1).int32(-1).str('trail').varint(0)
  w.varint(1).str('reach').varint(0).varint(1).varint(1).varint(2).float(0.75).byte(-1)
  w.varint(1).str('follow').varint(1).varint(1).varint(2).varint(1).bool(false).bool(true).floats([5, 1, 2, 0.1, 0.2, 3, 0.5, 0.6, 0.7, 0.8])
  w.varint(1).str('rail').varint(2).varint(1).varint(2).varint(3).varint(1).varint(2).varint(1).floats([0, 0.5, 0.1, 1, 0.9])
  w.varint(4)
  w.varint(0).varint(1).str('body').str(null).byte(0).str('body-region').floats([0, 0, 0, 1, 1, 20, 40]).int32(-1)
  w.varint(1).varint(2)
  w.str('mesh').str(null).byte(2).str(null).int32(-1).varint(3).floats([0, 0, 1, 0, 0, 1]).varint(3).short(0).short(1).short(2)
  w.bool(false).floats([0, 0, 10, 0, 0, 10]).varint(3).varint(6).short(0).short(2).short(2).short(4).short(4).short(0).float(10).float(10)
  w.str('box').str(null).byte(1).varint(3).bool(true)
  for (const [x, y] of [[0, 0], [5, 0], [0, 5]]) w.varint(1).varint(1).float(x).float(y).float(1)
  w.int32(0x00ff00ff)
  w.varint(2).varint(1).str('clipper').str(null).byte(6).varint(3).varint(3).bool(false).floats([0, 0, 30, 0, 0, 30]).int32(-1)
  w.varint(3).varint(1).str('trail').str(null).byte(4).bool(false).bool(true).varint(6).bool(false).floats([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]).floats([7, 8]).int32(-1)
  w.varint(1).str('alt').varint(1).varint(1).varint(1).str('mesh').str(null).byte(3).str(null).int32(-1).str(null).str('mesh').bool(true).float(10).float(10)
  w.varint(1).str('hit').varint(-5, false).float(1.5).str('boom')
  w.varint(1).str('act')
  w.varint(1).varint(1).varint(3)
  w.byte(0).varint(2).float(0).str('mesh').float(0.5).str(null)
  w.byte(1).varint(2).float(0).int32(-1).byte(LINEAR).float(1).int32(0x000000ff)
  w.byte(2).varint(2).float(0).int32(-1).int32(0x000000).byte(STEPPED).float(1).int32(0x808080ff).int32(0xffffff)
  w.varint(1).varint(1).varint(4)
  w.byte(0).varint(2).float(0).float(170).byte(BEZIER).floats([0.25, 0, 0.75, 1]).float(1).float(-170)
  w.byte(1).varint(2).float(0).float(0).float(0).byte(STEPPED).float(1).float(10).float(20)
  w.byte(2).varint(2).float(0).float(1).float(1).byte(LINEAR).float(1).float(2).float(2)
  w.byte(3).varint(2).float(0).float(0).float(0).byte(LINEAR).float(1).float(5).float(0)
  w.varint(1).varint(0).varint(2).float(0).float(1).byte(1).byte(LINEAR).float(1).float(0).byte(-1)
  w.varint(1).varint(0).varint(2).float(0).floats([1, 1, 1, 1]).byte(LINEAR).float(1).floats([0, 0, 0, 0])
  w.varint(1).varint(0).varint(3)
  w.byte(0).varint(1).float(0).float(0.2)
  w.byte(1).varint(1).float(0).float(0.3)
  w.byte(2).varint(2).float(0).float(1).float(1).byte(LINEAR).float(1).float(0).float(0)
  w.varint(1).varint(0).varint(1).varint(1).varint(1).str('mesh').varint(2)
  w.float(0).varint(0).byte(BEZIER).floats([0.1, 0.2, 0.3, 0.4])
  w.float(1).varint(2).varint(2).float(3).float(4)
  w.varint(1).float(0.5).varint(1).varint(3).varint(-2)
  w.varint(1).float(0.25).varint(0).varint(7, false).float(2.5).bool(true).str('custom')
  return w.toBytes()
}

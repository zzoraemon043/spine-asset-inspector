export class LegacyBinaryInput {
  private readonly view: DataView
  private readonly bytes: Uint8Array
  private readonly decoder = new TextDecoder('utf-8')
  position = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  private ensure(count: number): void {
    if (this.position + count > this.bytes.length) throw new Error(`二進位資料提前結束（位置 ${this.position}）`)
  }

  readByte(): number {
    this.ensure(1)
    return this.view.getInt8(this.position++)
  }

  readUnsignedByte(): number {
    this.ensure(1)
    return this.bytes[this.position++]
  }

  readBoolean(): boolean {
    return this.readUnsignedByte() !== 0
  }

  readShort(): number {
    this.ensure(2)
    const value = this.view.getInt16(this.position)
    this.position += 2
    return value
  }

  readInt32(): number {
    this.ensure(4)
    const value = this.view.getInt32(this.position)
    this.position += 4
    return value
  }

  readFloat(): number {
    this.ensure(4)
    const value = this.view.getFloat32(this.position)
    this.position += 4
    return value
  }

  readVarInt(optimizePositive: boolean): number {
    let b = this.readUnsignedByte()
    let result = b & 0x7f
    if (b & 0x80) {
      b = this.readUnsignedByte()
      result |= (b & 0x7f) << 7
      if (b & 0x80) {
        b = this.readUnsignedByte()
        result |= (b & 0x7f) << 14
        if (b & 0x80) {
          b = this.readUnsignedByte()
          result |= (b & 0x7f) << 21
          if (b & 0x80) {
            b = this.readUnsignedByte()
            result |= (b & 0x7f) << 28
          }
        }
      }
    }
    return optimizePositive ? result | 0 : (result >>> 1) ^ -(result & 1)
  }

  readString(): string | null {
    const count = this.readVarInt(true)
    if (count === 0) return null
    if (count === 1) return ''
    const length = count - 1
    this.ensure(length)
    const value = this.decoder.decode(this.bytes.subarray(this.position, this.position + length))
    this.position += length
    return value
  }

  get remaining(): number {
    return this.bytes.length - this.position
  }
}

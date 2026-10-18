import { describe, expect, it } from 'vitest'
import { detectBinaryVersion, detectJsonVersion, detectVersion, parseVersion } from '../../src/core/spine/versionDetect'

function binaryString(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)]
  return [bytes.length + 1, ...bytes]
}

describe('spine version detection', () => {
  it('parses semantic versions and compatibility', () => {
    expect(parseVersion('4.2.43')).toEqual({ raw: '4.2.43', major: 4, minor: 2, compatible: true })
    expect(parseVersion('4.1.24').compatible).toBe(false)
    expect(parseVersion('garbage')).toEqual({ raw: 'garbage', major: null, minor: null, compatible: false })
    expect(parseVersion(null).raw).toBeNull()
  })

  it('reads the json skeleton header', () => {
    expect(detectJsonVersion({ skeleton: { spine: '4.2.120' } })).toBe('4.2.120')
    expect(detectJsonVersion({ skeleton: {} })).toBeNull()
    expect(detectJsonVersion(null)).toBeNull()
    expect(detectVersion('json', '{"skeleton":{"spine":"3.8.99"}}').major).toBe(3)
    expect(detectVersion('json', '{broken').raw).toBeNull()
  })

  it('reads modern binary headers with an 8 byte hash', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, ...binaryString('4.2.71'), 0, 0])
    expect(detectBinaryVersion(bytes)).toBe('4.2.71')
    expect(detectVersion('binary', bytes).compatible).toBe(true)
  })

  it('reads legacy binary headers with a string hash', () => {
    const bytes = new Uint8Array([...binaryString('abcdefghijk'), ...binaryString('3.8.99'), 0])
    expect(detectBinaryVersion(bytes)).toBe('3.8.99')
  })

  it('returns null for unreadable binaries', () => {
    expect(detectBinaryVersion(new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255]))).toBeNull()
    expect(detectBinaryVersion(new Uint8Array(0))).toBeNull()
  })
})

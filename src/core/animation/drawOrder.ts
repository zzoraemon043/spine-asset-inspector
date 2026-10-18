export interface DrawOrderOffset {
  readonly slot: string
  readonly offset: number
}

function stableSet(sequence: readonly number[]): Set<number> {
  const tails: number[] = []
  const tailIndex: number[] = []
  const previous: number[] = new Array(sequence.length).fill(-1)
  sequence.forEach((value, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (tails[middle] < value) low = middle + 1
      else high = middle
    }
    tails[low] = value
    tailIndex[low] = index
    previous[index] = low > 0 ? tailIndex[low - 1] : -1
  })
  const result = new Set<number>()
  let cursor = tailIndex.length > 0 ? tailIndex[tailIndex.length - 1] : -1
  while (cursor >= 0) {
    result.add(sequence[cursor])
    cursor = previous[cursor]
  }
  return result
}

export function drawOrderOffsets(setup: readonly string[], desired: readonly string[]): DrawOrderOffset[] {
  const position = new Map(desired.map((name, index) => [name, index]))
  const sequence = desired.map((name) => setup.indexOf(name)).filter((index) => index >= 0)
  const stable = stableSet(sequence)
  const result: DrawOrderOffset[] = []
  setup.forEach((name, index) => {
    const target = position.get(name)
    if (target !== undefined && !stable.has(index)) result.push({ slot: name, offset: target - index })
  })
  return result
}

export function applyDrawOrderOffsets(setup: readonly string[], offsets: readonly DrawOrderOffset[]): string[] {
  const count = setup.length
  const order: number[] = Array.from({ length: count }, () => -1)
  const unchanged: number[] = []
  let original = 0
  const sorted = offsets
    .map((entry) => ({ index: setup.indexOf(entry.slot), offset: entry.offset }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)
  for (const entry of sorted) {
    while (original !== entry.index) unchanged.push(original++)
    const target = original + entry.offset
    if (target < 0 || target >= count || order[target] !== -1) throw new Error('繪製順序位移無效')
    order[target] = original++
  }
  while (original < count) unchanged.push(original++)
  for (let index = count - 1; index >= 0; index -= 1) if (order[index] === -1) order[index] = unchanged.pop() as number
  return order.map((index) => setup[index])
}

export function moveInOrder(order: readonly string[], slot: string, delta: number): string[] {
  const index = order.indexOf(slot)
  if (index < 0) return [...order]
  const target = Math.min(order.length - 1, Math.max(0, index + delta))
  const next = order.filter((name) => name !== slot)
  next.splice(target, 0, slot)
  return next
}

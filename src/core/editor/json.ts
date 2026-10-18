export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export interface JsonObject {
  [key: string]: JsonValue
}
export type JsonContainer = JsonValue[] | JsonObject
export type JsonPath = readonly (string | number)[]

export function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null
}

export function isObject(value: unknown): value is JsonObject {
  return isContainer(value) && !Array.isArray(value)
}

export function childOf(container: JsonValue | undefined, key: string | number): JsonValue | undefined {
  if (Array.isArray(container)) return typeof key === 'number' ? container[key] : undefined
  if (isObject(container)) return typeof key === 'string' && Object.prototype.hasOwnProperty.call(container, key) ? container[key] : undefined
  return undefined
}

export function valueAt(root: JsonValue, path: JsonPath): JsonValue | undefined {
  let current: JsonValue | undefined = root
  for (const key of path) {
    current = childOf(current, key)
    if (current === undefined) return undefined
  }
  return current
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || !isContainer(a) || !isContainer(b)) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]))
  const left = a as JsonObject
  const right = b as JsonObject
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key, index) => Object.keys(right)[index] === key && jsonEqual(left[key], right[key]))
}

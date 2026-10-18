import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'coverage', '.vite'])

export function walkFiles(root, entries, accept) {
  const result = []
  const visit = (path) => {
    let stats
    try {
      stats = statSync(path)
    } catch {
      return
    }
    if (stats.isDirectory()) {
      const name = path.split(sep).pop()
      if (IGNORED_DIRECTORIES.has(name)) return
      for (const child of readdirSync(path).sort()) visit(join(path, child))
      return
    }
    const rel = relative(root, path).split(sep).join('/')
    if (accept(rel)) result.push(rel)
  }
  for (const entry of entries) visit(join(root, entry))
  return result
}

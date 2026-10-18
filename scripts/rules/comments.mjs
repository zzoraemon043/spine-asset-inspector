import ts from 'typescript'

export const COMMENT_TARGETS = ['src', 'scripts', 'tests', 'index.html', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'csp.config.ts']

const SCRIPT_KINDS = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mts': ts.ScriptKind.TS,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
}

export function isCommentTarget(path) {
  return /\.(ts|tsx|mts|js|mjs|jsx|css|html)$/.test(path)
}

function lineOf(text, position) {
  let line = 1
  for (let i = 0; i < position && i < text.length; i++) if (text.charCodeAt(i) === 10) line += 1
  return line
}

function snippet(text, start, end) {
  return text.slice(start, Math.min(end, start + 60)).replace(/\s+/g, ' ').trim()
}

export function findScriptComments(text, extension) {
  const kind = SCRIPT_KINDS[extension] ?? ts.ScriptKind.TS
  const source = ts.createSourceFile(`file${extension}`, text, ts.ScriptTarget.Latest, true, kind)
  const found = new Map()
  const collect = (ranges) => {
    for (const range of ranges ?? []) {
      if (!found.has(range.pos)) found.set(range.pos, { line: lineOf(text, range.pos), text: snippet(text, range.pos, range.end) })
    }
  }
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return
    if (node.kind < ts.SyntaxKind.FirstNode || node.kind === ts.SyntaxKind.EndOfFileToken) {
      collect(ts.getLeadingCommentRanges(text, node.pos))
      collect(ts.getTrailingCommentRanges(text, node.end))
      return
    }
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)
  if (text.startsWith('#!')) found.set(0, { line: 1, text: snippet(text, 0, text.indexOf('\n')) })
  return [...found.values()].sort((a, b) => a.line - b.line)
}

function stripCssStrings(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (match) => match.replace(/[^\n]/g, ' '))
}

export function findCssComments(text) {
  const cleaned = stripCssStrings(text)
  const result = []
  const pattern = /\/\*/g
  let match
  while ((match = pattern.exec(cleaned))) result.push({ line: lineOf(text, match.index), text: snippet(text, match.index, match.index + 60) })
  return result
}

export function findHtmlComments(text) {
  const result = []
  const pattern = /<!--/g
  let match
  while ((match = pattern.exec(text))) result.push({ line: lineOf(text, match.index), text: snippet(text, match.index, match.index + 60) })
  return result
}

export function findComments(path, text) {
  const extension = path.slice(path.lastIndexOf('.'))
  if (extension === '.css') return findCssComments(text)
  if (extension === '.html') return findHtmlComments(text)
  return findScriptComments(text, extension)
}

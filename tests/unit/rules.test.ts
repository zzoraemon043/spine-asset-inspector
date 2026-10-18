import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findComments, findCssComments, findHtmlComments, findScriptComments, COMMENT_TARGETS, isCommentTarget } from '../../scripts/rules/comments.mjs'
import { findEmoji, EMOJI_TARGETS, isEmojiTarget } from '../../scripts/rules/emoji.mjs'
import { walkFiles } from '../../scripts/rules/files.mjs'

const root = join(__dirname, '..', '..')
const slash = '/'
const lineComment = `${slash}${slash} note`
const blockComment = `${slash}* note *${slash}`

describe('no-comment rule', () => {
  it('detects line, block and doc comments in scripts', () => {
    expect(findScriptComments(`const a = 1 ${lineComment}\n`, '.ts')).toHaveLength(1)
    expect(findScriptComments(`${blockComment}\nconst a = 1\n`, '.ts')).toHaveLength(1)
    expect(findScriptComments(`${slash}** doc *${slash}\nexport type A = string\n`, '.ts')[0].line).toBe(1)
    expect(findScriptComments(`function f() {\n  return 1\n  ${lineComment}\n}\n`, '.mjs')[0].line).toBe(3)
  })

  it('detects comments inside JSX expressions', () => {
    const source = `export const A = () => <div>{${blockComment}}</div>\n`
    expect(findScriptComments(source, '.tsx')).toHaveLength(1)
  })

  it('ignores comment-like text in strings, templates, regex and JSX text', () => {
    const source = [
      `const url = 'https:${slash}${slash}example.com'`,
      `const t = \`${slash}* not *${slash}\``,
      `const r = ${slash}\\${slash}\\*${slash}g`,
      `export const B = () => <p>see https:${slash}${slash}docs and ${slash}* text *${slash}</p>`,
    ].join('\n')
    expect(findScriptComments(source, '.tsx')).toEqual([])
  })

  it('detects css and html comments while ignoring css strings', () => {
    expect(findCssComments(`a { color: red; } ${blockComment}`)).toHaveLength(1)
    expect(findCssComments(`a::after { content: "${slash}*"; }`)).toHaveLength(0)
    expect(findHtmlComments('<div><!-- note --></div>')).toHaveLength(1)
    expect(findComments('x.css', blockComment)).toHaveLength(1)
    expect(findComments('x.html', '<!-- a -->')).toHaveLength(1)
  })

  it('reports shebang lines', () => {
    expect(findScriptComments('#!/usr/bin/env node\nconsole.log(1)\n', '.mjs')).toHaveLength(1)
  })

  it('passes on the whole repository', () => {
    const files = walkFiles(root, COMMENT_TARGETS, isCommentTarget)
    expect(files.length).toBeGreaterThan(50)
    const violations = files.flatMap((file) => findComments(file, readFileSync(join(root, file), 'utf8')).map((hit) => `${file}:${hit.line}`))
    expect(violations).toEqual([])
  })
})

describe('zero-emoji rule', () => {
  it('detects pictographs, flags, keycaps and variation selectors', () => {
    expect(findEmoji(`ok ${String.fromCodePoint(0x1f600)}`)).toEqual([{ line: 1, codePoint: 'U+1F600' }])
    expect(findEmoji(`a\n${String.fromCodePoint(0x1f1f9, 0x1f1fc)}`)).toHaveLength(2)
    expect(findEmoji(`1${String.fromCodePoint(0xfe0f, 0x20e3)}`)).toHaveLength(2)
    expect(findEmoji(String.fromCodePoint(0x2705))).toHaveLength(1)
    expect(findEmoji(String.fromCodePoint(0x2764))).toHaveLength(1)
  })

  it('accepts plain technical text including CJK and box drawing', () => {
    expect(findEmoji('Spine 骨架檢驗 [PASS] 0.2s -> 1.0x | src/ ├── core')).toEqual([])
  })

  it('passes on the whole repository including documentation', () => {
    const files = walkFiles(root, EMOJI_TARGETS, isEmojiTarget)
    expect(files).toContain('README.md')
    expect(files).toContain('docs/HANDOFF.md')
    const violations = files.flatMap((file) => findEmoji(readFileSync(join(root, file), 'utf8')).map((hit) => `${file}:${hit.line}`))
    expect(violations).toEqual([])
  })
})

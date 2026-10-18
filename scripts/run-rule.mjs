import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkFiles } from './rules/files.mjs'
import { COMMENT_TARGETS, findComments, isCommentTarget } from './rules/comments.mjs'
import { EMOJI_TARGETS, findEmoji, isEmojiTarget } from './rules/emoji.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] ?? 'all'

function checkComments() {
  const files = walkFiles(root, COMMENT_TARGETS, isCommentTarget)
  const violations = []
  for (const file of files) {
    for (const hit of findComments(file, readFileSync(join(root, file), 'utf8'))) violations.push(`${file}:${hit.line}  ${hit.text}`)
  }
  return { name: 'no-comments', files: files.length, violations }
}

function checkEmoji() {
  const files = walkFiles(root, EMOJI_TARGETS, isEmojiTarget)
  const violations = []
  for (const file of files) {
    for (const hit of findEmoji(readFileSync(join(root, file), 'utf8'))) violations.push(`${file}:${hit.line}  ${hit.codePoint}`)
  }
  return { name: 'zero-emoji', files: files.length, violations }
}

const checks = mode === 'comments' ? [checkComments] : mode === 'emoji' ? [checkEmoji] : [checkComments, checkEmoji]
let failed = false
for (const check of checks) {
  const result = check()
  if (result.violations.length > 0) {
    failed = true
    console.error(`[FAIL] ${result.name}: ${result.violations.length} violation(s) in ${result.files} file(s)`)
    for (const line of result.violations) console.error(`  ${line}`)
  } else {
    console.log(`[PASS] ${result.name}: ${result.files} file(s) clean`)
  }
}
process.exit(failed ? 1 : 0)

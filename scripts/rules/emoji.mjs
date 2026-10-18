export const EMOJI_TARGETS = ['src', 'scripts', 'tests', 'docs', 'README.md', 'index.html', 'package.json', 'LICENSE', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'csp.config.ts', 'tsconfig.json']

export function isEmojiTarget(path) {
  return /\.(ts|tsx|mts|js|mjs|jsx|css|html|md|json|txt|yml|yaml)$/.test(path) || path === 'LICENSE'
}

const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu

function lineOf(text, position) {
  let line = 1
  for (let i = 0; i < position; i++) if (text.charCodeAt(i) === 10) line += 1
  return line
}

export function findEmoji(text) {
  const result = []
  for (const match of text.matchAll(EMOJI_PATTERN)) {
    const codePoint = match[0].codePointAt(0) ?? 0
    result.push({ line: lineOf(text, match.index ?? 0), codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}` })
  }
  return result
}

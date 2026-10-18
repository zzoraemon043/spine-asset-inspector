declare module '*/scripts/rules/comments.mjs' {
  export interface CommentHit {
    readonly line: number
    readonly text: string
  }
  export const COMMENT_TARGETS: string[]
  export function isCommentTarget(path: string): boolean
  export function findScriptComments(text: string, extension: string): CommentHit[]
  export function findCssComments(text: string): CommentHit[]
  export function findHtmlComments(text: string): CommentHit[]
  export function findComments(path: string, text: string): CommentHit[]
}

declare module '*/scripts/rules/emoji.mjs' {
  export const EMOJI_TARGETS: string[]
  export function isEmojiTarget(path: string): boolean
  export function findEmoji(text: string): Array<{ line: number; codePoint: string }>
}

declare module '*/scripts/rules/files.mjs' {
  export function walkFiles(root: string, entries: string[], accept: (path: string) => boolean): string[]
}

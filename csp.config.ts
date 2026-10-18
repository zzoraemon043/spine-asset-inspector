export const CSP_DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ['default-src', "'none'"],
  ['script-src', "'self'"],
  ['style-src', "'self'"],
  ['img-src', "'self' blob: data:"],
  ['media-src', "'self' blob:"],
  ['font-src', "'self'"],
  ['connect-src', "'none'"],
  ['worker-src', "'none'"],
  ['manifest-src', "'none'"],
  ['object-src', "'none'"],
  ['frame-src', "'none'"],
  ['child-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
]

export const CSP_HEADER_ONLY_DIRECTIVES: ReadonlyArray<readonly [string, string]> = [['frame-ancestors', "'none'"]]

export function serializeCsp(directives: ReadonlyArray<readonly [string, string]>): string {
  return directives.map(([name, value]) => `${name} ${value}`).join('; ')
}

export const CSP_META = serializeCsp(CSP_DIRECTIVES)
export const CSP_HEADER = serializeCsp([...CSP_DIRECTIVES, ...CSP_HEADER_ONLY_DIRECTIVES])

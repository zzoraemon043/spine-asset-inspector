const PALETTE = ['#f59e0b', '#f43f5e', '#22d3ee', '#a78bfa', '#10b981', '#fb923c', '#60a5fa', '#e879f9']

export function eventColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

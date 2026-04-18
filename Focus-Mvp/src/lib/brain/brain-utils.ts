import { BrainEntry } from './brain-types'

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 5) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${diffYear}y ago`
}

export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildEntryPreview(entry: BrainEntry): string {
  return [
    `### [${entry.type}] ${entry.title}`,
    `Weight: ${entry.aiContextWeight} | Domain: ${entry.domain}`,
    entry.summary,
    '',
    entry.body.slice(0, 300) + (entry.body.length > 300 ? '...' : ''),
    entry.conditions.length > 0 ? `Conditions: ${entry.conditions.join(' | ')}` : '',
    entry.actions.length > 0 ? `Actions: ${entry.actions.join(' | ')}` : '',
  ].filter(Boolean).join('\n')
}

import { formatDate } from '@/lib/utils'
import type { BrainEntry } from './brain-types'

export function formatRelativeTime(dateString: string): string {
  const now = Date.now()
  const diffMs = now - new Date(dateString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

export const formatShortDate = formatDate

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

import { formatDate } from '@/lib/utils'
import type { BrainEntry } from './brain-types'

export function daysSince(dateString: string): number {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000)
}

export function formatRelativeTime(dateString: string): string {
  const days = daysSince(dateString)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export const formatShortDate = formatDate

export type StalenessLevel = 'fresh' | 'review' | 'stale'

export function getStaleness(updatedAt: string): StalenessLevel {
  const days = daysSince(updatedAt)
  if (days >= 180) return 'stale'
  if (days >= 90) return 'review'
  return 'fresh'
}

export function getMockStaleness(entryId: string): StalenessLevel {
  if (entryId === 'brain-003') return 'stale'
  if (entryId === 'brain-005') return 'review'
  return 'fresh'
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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

import type { StalenessLevel } from '@/lib/brain/brain-utils'
import { formatRelativeTime } from '@/lib/brain/brain-utils'

export function BrainStalenessTag({
  level,
  updatedAt,
}: {
  level: StalenessLevel
  updatedAt: string
}) {
  if (level === 'fresh') return null

  if (level === 'review') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
        Review due &middot; {formatRelativeTime(updatedAt)}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-200">
      Stale &middot; {formatRelativeTime(updatedAt)}
    </span>
  )
}

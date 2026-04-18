'use client'

import Link from 'next/link'
import { TYPE_CONFIG } from '@/lib/brain/brain-config'
import { formatRelativeTime, getMockStaleness } from '@/lib/brain/brain-utils'
import { BrainTypeBadge } from './BrainTypeBadge'
import { BrainWeightDots } from './BrainWeightDots'
import { BrainStalenessTag } from './BrainStalenessTag'
import { MOCK_FLAGS } from '@/lib/brain/mock-data'
import type { BrainEntry } from '@/lib/brain/brain-types'

export function BrainEntryCard({ entry }: { entry: BrainEntry }) {
  const staleness = getMockStaleness(entry.id)
  const flagCount = MOCK_FLAGS.filter((f) => f.entryId === entry.id && !f.resolved).length
  const initials = entry.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)

  return (
    <Link href={`/brain/${entry.id}`} className="block group">
      <div
        className="bg-white border border-[#E2E8F0] rounded-lg p-4 transition-shadow duration-100 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] cursor-pointer"
        style={{ borderLeftWidth: 3, borderLeftColor: TYPE_CONFIG[entry.type].color }}
      >
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <BrainTypeBadge type={entry.type} />
          <BrainStalenessTag level={staleness} updatedAt={entry.updatedAt} />
          <div className="flex-1" />
          <BrainWeightDots weight={entry.aiContextWeight} />
        </div>

        <p className="text-[13px] font-medium text-[#0F172A]">{entry.title}</p>
        <p className="text-xs text-[#475569] line-clamp-2 mt-0.5">{entry.summary}</p>

        <div className="flex items-center gap-2 mt-2.5 text-[11px] text-[#94A3B8]">
          <div className="w-[18px] h-[18px] rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <span className="text-[8px] font-medium text-slate-600">{initials}</span>
          </div>
          <span className="text-[#475569]">{entry.owner.name}</span>
          <span>&middot;</span>
          <span>v{entry.version}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(entry.updatedAt)}</span>
          {flagCount > 0 && (
            <>
              <div className="flex-1" />
              <span className="text-amber-600">&bull; {flagCount} flag{flagCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/lib/brain/brain-utils'
import type { BrainEntryVersion } from '@/lib/brain/brain-types'

const MOCK_DIFFS: Record<number, { before: string; after: string }> = {
  3: {
    before: '...no single supplier may account for more than 35% of total...',
    after: '...no single supplier may account for more than 40% of total...',
  },
  2: {
    before: '(No exception clause for thin supplier markets)',
    after: 'Categories with fewer than 3 qualified suppliers (documented exception required)',
  },
}

export function BrainVersionHistory({
  versions,
  onProposeChange,
}: {
  versions: BrainEntryVersion[]
  onProposeChange: () => void
}) {
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-[#0F172A]">Version history</p>
        <button onClick={onProposeChange} className="text-xs text-[#475569] hover:text-[#0F172A] transition-colors">
          Propose change
        </button>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-[#94A3B8]">No version history</p>
      ) : (
        <div className="relative ml-[9px]">
          <div className="absolute left-0 top-0 bottom-0 border-l-2 border-slate-200" />
          <div className="space-y-5">
            {versions.map((v, i) => {
              const isLatest = i === 0
              const isFirst = v.version === 1
              const diff = MOCK_DIFFS[v.version]
              const expanded = !!expandedDiffs[v.id]

              return (
                <div key={v.id} className="relative pl-7">
                  <div className={cn(
                    'absolute left-[-2px] w-5 h-5 rounded-full border-2 border-white top-0',
                    isLatest ? 'ring-2 ring-[#EA580C] bg-[#EA580C]' : 'ring-2 ring-slate-300 bg-white'
                  )} />

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">v{v.version}</span>
                    <span className="text-sm text-[#475569]">{formatShortDate(v.createdAt)}</span>
                    <span className="text-sm text-[#475569]">&middot; {v.changedBy.name}</span>
                    {isFirst && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Initial commit</Badge>}
                  </div>

                  {v.changeNote && (
                    <p className="text-sm text-[#475569] italic mt-0.5">&ldquo;{v.changeNote}&rdquo;</p>
                  )}

                  {!isFirst && diff && (
                    <button
                      type="button"
                      onClick={() => setExpandedDiffs((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                      className="text-xs text-[#94A3B8] hover:text-[#475569] cursor-pointer mt-1"
                    >
                      {expanded ? 'Hide diff' : 'Show diff ↓'}
                    </button>
                  )}

                  {expanded && diff && (
                    <div className="mt-2 mb-3 rounded-lg border border-slate-200 overflow-hidden">
                      <div className="bg-[#FEF2F2] text-[#991B1B] px-3 py-0.5 font-mono text-xs">- {diff.before}</div>
                      <div className="bg-[#F0FDF4] text-[#166534] px-3 py-0.5 font-mono text-xs">+ {diff.after}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

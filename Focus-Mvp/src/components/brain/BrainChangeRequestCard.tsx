'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { BrainTypeBadge } from './BrainTypeBadge'
import { formatRelativeTime, slugify } from '@/lib/brain/brain-utils'
import { MOCK_FOLDERS } from '@/lib/brain/mock-data'
import { DOMAIN_LABELS } from '@/lib/brain/brain-config'
import type { ChangeRequest } from '@/lib/brain/brain-types'

function getEntryPath(cr: ChangeRequest): string {
  const folder = MOCK_FOLDERS.find((f) => f.entryIds.includes(cr.entryId))
  const domain = DOMAIN_LABELS[cr.entryType === 'RULE' ? 'INVENTORY' : 'PROCUREMENT'].toLowerCase()
  const folderSlug = folder ? slugify(folder.name) : 'uncategorized'
  const entrySlug = slugify(cr.entryTitle)
  return `brain / ${domain} / ${folderSlug} / ${entrySlug}`
}

export function BrainChangeRequestCard({
  cr,
  onMerge,
  onClose,
}: {
  cr: ChangeRequest
  onMerge: (id: string) => void
  onClose: (id: string) => void
}) {
  const [showDiff, setShowDiff] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const initials = cr.requestedBy.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
  const isPending = cr.status === 'PENDING'

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-[15px] font-medium text-[#0F172A]">{cr.title}</p>
        <span className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
          isPending ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'
        )}>
          {isPending ? 'OPEN' : cr.status === 'APPROVED' ? 'MERGED' : 'CLOSED'}
        </span>
      </div>

      <Link href={`/brain/${cr.entryId}`} className="font-mono text-xs text-[#94A3B8] hover:text-[#475569] transition-colors">
        {getEntryPath(cr)}
      </Link>

      <div className="flex items-center gap-2 text-xs text-[#94A3B8] mt-3 mb-3">
        <span>Opened by</span>
        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-[8px] font-medium text-slate-600">{initials}</span>
        </div>
        <span className="text-[#475569]">{cr.requestedBy.name}</span>
        <span>&middot;</span>
        <span>{formatRelativeTime(cr.createdAt)}</span>
      </div>

      <p className="text-sm text-[#475569] mb-3">{cr.description}</p>

      <button
        type="button"
        onClick={() => setShowDiff(!showDiff)}
        className="text-xs text-[#94A3B8] hover:text-[#475569] cursor-pointer mb-3"
      >
        {showDiff ? 'Hide proposed changes' : 'Show proposed changes ↓'}
      </button>

      {showDiff && (
        <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-[#F0FDF4] text-[#166534] px-3 py-2 font-mono text-xs">+ {cr.proposedBody}</div>
        </div>
      )}

      {isPending && (
        <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
          <Input
            placeholder="Optional note to requester..."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="rounded-lg text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="text-[#475569]" onClick={() => onClose(cr.id)}>
              Close without merging
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onMerge(cr.id)}>
              Merge changes ✓
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  CheckCircle,
  XCircle,
  GitBranch,
  Lock,
  ListOrdered,
  Lightbulb,
  Handshake,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { MOCK_CHANGE_REQUESTS } from '@/lib/brain/mock-data'
import { TYPE_CONFIG } from '@/lib/brain/brain-config'
import { formatRelativeTime } from '@/lib/brain/brain-utils'
import type {
  ChangeRequest,
  ChangeRequestStatus,
  BrainEntryType,
} from '@/lib/brain/brain-types'

const TYPE_ICONS: Record<BrainEntryType, React.ElementType> = {
  RULE: GitBranch,
  PROCESS: ListOrdered,
  CONSTRAINT: Lock,
  KNOWLEDGE: Lightbulb,
  AGREEMENT: Handshake,
}

export default function ChangeRequestsPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<ChangeRequestStatus>('PENDING')
  const [requests, setRequests] = useState<ChangeRequest[]>([
    ...MOCK_CHANGE_REQUESTS,
  ])
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  const filtered = requests.filter((cr) => cr.status === activeTab)
  const pendingCount = requests.filter((cr) => cr.status === 'PENDING').length

  function handleApprove(crId: string) {
    // TODO: wire to PATCH /api/brain/change-requests/[crId]
    setRequests((prev) =>
      prev.map((cr) =>
        cr.id === crId ? { ...cr, status: 'APPROVED' as ChangeRequestStatus } : cr
      )
    )
    toast.success('Change applied. Entry updated.')
  }

  function handleReject(crId: string) {
    // TODO: wire to PATCH /api/brain/change-requests/[crId]
    setRequests((prev) =>
      prev.map((cr) =>
        cr.id === crId ? { ...cr, status: 'REJECTED' as ChangeRequestStatus } : cr
      )
    )
    toast.info('Change request rejected.')
  }

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/brain"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Operational Brain
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Change Requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review proposed changes to Brain entries
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(
          [
            { key: 'PENDING', label: `Pending (${pendingCount})` },
            { key: 'APPROVED', label: 'Approved' },
            { key: 'REJECTED', label: 'Rejected' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Request cards */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500">
            {activeTab === 'PENDING'
              ? 'No pending change requests. When team members propose changes to Brain entries, they\u2019ll appear here for your review.'
              : activeTab === 'APPROVED'
                ? 'No approved changes yet.'
                : 'No rejected requests.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((cr) => {
            const config = TYPE_CONFIG[cr.entryType]
            const Icon = TYPE_ICONS[cr.entryType]
            const isDiffExpanded = !!expandedDiffs[cr.id]
            return (
              <div
                key={cr.id}
                className="bg-white border border-slate-200 rounded-xl p-5"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                        config.tailwindBg,
                        config.tailwindText,
                        config.tailwindBorder
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                    <span className="text-sm text-slate-600">
                      {cr.entryTitle}
                    </span>
                  </div>
                  <Link
                    href={`/brain/${cr.entryId}`}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    view entry
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {/* Requester info */}
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                  <span>Proposed by</span>
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-semibold text-white">
                      {cr.requestedBy.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  </div>
                  <span className="text-slate-600">{cr.requestedBy.name}</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(cr.createdAt)}</span>
                </div>

                {/* Change details */}
                <h4 className="text-base font-semibold text-slate-900 mb-1">
                  {cr.title}
                </h4>
                <p className="text-sm text-slate-500 mb-3">{cr.description}</p>

                {/* View proposed changes toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedDiffs((prev) => ({
                      ...prev,
                      [cr.id]: !prev[cr.id],
                    }))
                  }
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-3"
                >
                  {isDiffExpanded
                    ? 'Hide proposed changes'
                    : 'View proposed changes'}
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-transform',
                      isDiffExpanded && 'rotate-180'
                    )}
                  />
                </button>

                {isDiffExpanded && (
                  <div className="mb-4 rounded-lg border border-slate-200 overflow-hidden text-sm">
                    <div className="bg-green-50 px-4 py-3 text-green-800">
                      <p className="font-mono text-xs text-green-600 mb-1">
                        + Proposed
                      </p>
                      {cr.proposedBody}
                    </div>
                  </div>
                )}

                {/* Review actions — only for PENDING */}
                {cr.status === 'PENDING' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <Input
                      placeholder="Add a note (optional)..."
                      value={reviewNotes[cr.id] || ''}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({
                          ...prev,
                          [cr.id]: e.target.value,
                        }))
                      }
                      className="rounded-lg text-sm"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleReject(cr.id)}
                      >
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApprove(cr.id)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        Approve & Apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

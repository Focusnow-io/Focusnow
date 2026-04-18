'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { MOCK_CHANGE_REQUESTS } from '@/lib/brain/mock-data'
import { BrainChangeRequestCard } from '@/components/brain/BrainChangeRequestCard'
import type { ChangeRequest, ChangeRequestStatus } from '@/lib/brain/brain-types'

type CRTab = 'PENDING' | 'APPROVED' | 'REJECTED'
const TAB_LABELS: Record<CRTab, string> = { PENDING: 'Open', APPROVED: 'Merged', REJECTED: 'Closed' }

export default function ChangeRequestsPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<CRTab>('PENDING')
  const [requests, setRequests] = useState<ChangeRequest[]>([...MOCK_CHANGE_REQUESTS])

  const counts = useMemo(() => ({
    PENDING: requests.filter((cr) => cr.status === 'PENDING').length,
    APPROVED: requests.filter((cr) => cr.status === 'APPROVED').length,
    REJECTED: requests.filter((cr) => cr.status === 'REJECTED').length,
  }), [requests])

  const filtered = useMemo(
    () => requests.filter((cr) => cr.status === activeTab),
    [requests, activeTab]
  )

  function handleMerge(crId: string) {
    // TODO: PATCH /api/brain/change-requests/[crId] { action: 'APPROVE' }
    setRequests((prev) => prev.map((cr) => cr.id === crId ? { ...cr, status: 'APPROVED' as ChangeRequestStatus } : cr))
    toast.success('Changes merged. Entry updated.')
  }

  function handleClose(crId: string) {
    // TODO: PATCH /api/brain/change-requests/[crId] { action: 'REJECT' }
    setRequests((prev) => prev.map((cr) => cr.id === crId ? { ...cr, status: 'REJECTED' as ChangeRequestStatus } : cr))
    toast.info('Change request closed.')
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#94A3B8]">
          <Link href="/brain" className="hover:text-[#475569] transition-colors">brain</Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono text-[#0F172A]">change-requests</span>
        </p>
        {counts.PENDING > 0 && (
          <span className="text-xs font-medium text-[#EA580C]">{counts.PENDING} pending</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm border-b border-[#E2E8F0] pb-px">
        {(Object.keys(TAB_LABELS) as CRTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'pb-2 border-b-2 transition-colors',
              activeTab === tab
                ? 'border-[#0F172A] text-[#0F172A] font-medium'
                : 'border-transparent text-[#94A3B8] hover:text-[#475569]'
            )}
          >
            {TAB_LABELS[tab]} ({counts[tab]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-[#94A3B8]">
            {activeTab === 'PENDING'
              ? "No open change requests. When team members propose changes to Brain entries, they'll appear here for review."
              : activeTab === 'APPROVED'
                ? 'No merged changes yet.'
                : 'No closed requests.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cr) => (
            <BrainChangeRequestCard key={cr.id} cr={cr} onMerge={handleMerge} onClose={handleClose} />
          ))}
        </div>
      )}
    </div>
  )
}

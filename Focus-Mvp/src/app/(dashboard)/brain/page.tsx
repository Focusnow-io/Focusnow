'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MOCK_BRAIN_ENTRIES,
  MOCK_BRAIN_STATS,
  MOCK_FOLDERS,
  MOCK_PINNED_ENTRY_IDS,
  MOCK_OWNER_SUMMARY,
  type BrainFolder,
} from '@/lib/brain/mock-data'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { formatRelativeTime, getMockStaleness } from '@/lib/brain/brain-utils'
import { BrainEntryCard } from '@/components/brain/BrainEntryCard'
import { BrainTypeBadge } from '@/components/brain/BrainTypeBadge'
import { BrainOwnerCard } from '@/components/brain/BrainOwnerCard'

export default function BrainPage() {
  const searchParams = useSearchParams()
  const folderId = searchParams.get('folder')

  if (folderId) {
    const folder = MOCK_FOLDERS.find((f) => f.id === folderId)
    if (folder) return <FolderView folder={folder} />
  }

  return <BrainHome />
}

function BrainHome() {
  // TODO: wire to API
  const stats = MOCK_BRAIN_STATS
  const needsReviewCount = MOCK_BRAIN_ENTRIES.filter((e) => getMockStaleness(e.id) !== 'fresh').length
  const coveredDomains = Object.values(stats.byDomain).filter((c) => c > 0).length
  const pinnedEntries = MOCK_BRAIN_ENTRIES.filter((e) => MOCK_PINNED_ENTRY_IDS.includes(e.id))

  const concentrationRisk = useMemo(() => {
    for (const owner of MOCK_OWNER_SUMMARY) {
      for (const domain of owner.domains) {
        const domainTotal = stats.byDomain[domain] || 0
        if (domainTotal > 0 && owner.entryCount / domainTotal > 0.5) {
          return { owner, domain: DOMAIN_LABELS[domain], pct: Math.round((owner.entryCount / domainTotal) * 100) }
        }
      }
    }
    return null
  }, [stats.byDomain])

  const uncoveredDomains = Object.entries(DOMAIN_LABELS)
    .filter(([key]) => (stats.byDomain[key as keyof typeof stats.byDomain] || 0) === 0)
    .map(([, label]) => label)

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-sm font-mono text-[#94A3B8]">brain</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/brain/change-requests">
              Change Requests
              {stats.pendingChangeRequests > 0 && (
                <span className="ml-1.5 text-xs text-[#EA580C] font-medium">{stats.pendingChangeRequests}&bull;</span>
              )}
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/brain/new">+ Add Entry</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={stats.activeCount} label="Active entries" />
        <StatCard value={stats.pendingChangeRequests} label="Pending CRs" />
        <StatCard value={`${coveredDomains} / ${Object.keys(DOMAIN_LABELS).length}`} label="Domains covered" />
        <StatCard value={needsReviewCount} label="Need review" highlight={needsReviewCount > 0} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-medium mb-2">Knowledge Owners</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MOCK_OWNER_SUMMARY.map((owner) => (
            <BrainOwnerCard
              key={owner.userId}
              initials={owner.initials}
              name={owner.name}
              subtitle={`${owner.entryCount} entries · ${owner.domains.map((d) => DOMAIN_LABELS[d]).join(', ')}`}
            />
          ))}
        </div>
        {concentrationRisk && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <span className="font-medium">Knowledge concentration risk:</span> {concentrationRisk.owner.name} owns {concentrationRisk.pct}% of {concentrationRisk.domain} entries. Consider distributing ownership or adding backup owners.
          </div>
        )}
        {uncoveredDomains.length > 0 && !concentrationRisk && (
          <p className="mt-2 text-xs text-[#94A3B8]">
            {uncoveredDomains.join(', ')} have no entries yet.
          </p>
        )}
      </div>

      {pinnedEntries.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-medium mb-2">Pinned</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pinnedEntries.map((entry) => (
              <div key={entry.id} className="min-w-[260px] max-w-[280px] shrink-0">
                <BrainEntryCard entry={entry} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-medium">Folders</p>
          <button className="text-xs text-[#475569] hover:text-[#0F172A] transition-colors">
            New folder
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MOCK_FOLDERS.map((folder) => (
            <FolderCard key={folder.id} folder={folder} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FolderCard({ folder }: { folder: BrainFolder }) {
  const entries = MOCK_BRAIN_ENTRIES.filter((e) => folder.entryIds.includes(e.id))
  const types = [...new Set(entries.map((e) => e.type))]
  const hasStale = entries.some((e) => getMockStaleness(e.id) !== 'fresh')
  const latestUpdate = entries.length > 0
    ? entries.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b).updatedAt
    : folder.createdAt

  return (
    <Link
      href={`/brain?folder=${folder.id}`}
      className="block bg-white border border-[#E2E8F0] rounded-lg p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow"
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-[13px] font-medium text-[#0F172A]">
          {hasStale && <span className="text-amber-500 mr-1">&bull;</span>}
          {folder.name}
        </p>
        <span className="text-xs text-[#94A3B8] shrink-0">{DOMAIN_LABELS[folder.domain]} · {entries.length} entries</span>
      </div>
      <p className="text-xs text-[#475569] line-clamp-1 mb-2.5">{folder.description}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {types.map((t) => <BrainTypeBadge key={t} type={t} />)}
        </div>
        <span className="text-[11px] text-[#94A3B8]">Updated {formatRelativeTime(latestUpdate)}</span>
      </div>
    </Link>
  )
}

function FolderView({ folder }: { folder: BrainFolder }) {
  const entries = MOCK_BRAIN_ENTRIES.filter((e) => folder.entryIds.includes(e.id))
  const owners = [...new Set(entries.map((e) => e.owner.name))]
  const highWeightCount = entries.filter((e) => e.aiContextWeight === 'HIGH').length
  const latestUpdate = entries.length > 0
    ? entries.reduce((a, b) => new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b).updatedAt
    : folder.createdAt

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#94A3B8]">
          <Link href="/brain" className="hover:text-[#475569] transition-colors">brain</Link>
          <span className="mx-1.5">/</span>
          <Link href="/brain" className="hover:text-[#475569] transition-colors">{DOMAIN_LABELS[folder.domain].toLowerCase()}</Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono text-[#0F172A]">{folder.name.toLowerCase().replace(/\s+/g, '-')}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">Edit folder</Button>
          <Button size="sm" asChild>
            <Link href={`/brain/new?folder=${folder.id}`}>+ Add Entry</Link>
          </Button>
        </div>
      </div>

      <div>
        <p className="font-mono text-lg font-medium text-[#0F172A]">{folder.name.toLowerCase().replace(/\s+/g, '-')}</p>
        <p className="text-sm text-[#475569] mt-1">{folder.description}</p>
        <p className="text-xs text-[#94A3B8] mt-2">
          {entries.length} entries · {highWeightCount} HIGH weight · Updated {formatRelativeTime(latestUpdate)} · Owned by {owners.join(', ')}
        </p>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => <BrainEntryCard key={entry.id} entry={entry} />)}
      </div>

      <Link
        href={`/brain/new?folder=${folder.id}&domain=${folder.domain}`}
        className="block w-full text-center py-3 border border-dashed border-[#E2E8F0] rounded-lg text-xs text-[#94A3B8] hover:text-[#475569] hover:border-[#CBD5E1] transition-colors"
      >
        + Add entry to this folder
      </Link>
    </div>
  )
}

function StatCard({
  value,
  label,
  highlight,
}: {
  value: number | string
  label: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
      <p className={cn('text-2xl font-semibold', highlight ? 'text-[#B45309]' : 'text-[#0F172A]')}>
        {value}
        {highlight && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1.5 align-middle" />}
      </p>
      <p className="text-xs text-[#94A3B8] mt-0.5">{label}</p>
    </div>
  )
}

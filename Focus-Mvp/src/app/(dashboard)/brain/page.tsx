'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CheckCircle,
  Plus,
  Search,
  ArrowRight,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_BRAIN_ENTRIES, MOCK_BRAIN_STATS } from '@/lib/brain/mock-data'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { formatRelativeTime } from '@/lib/brain/brain-utils'
import { TypeBadge } from '@/components/brain/TypeBadge'
import { StatusBadge } from '@/components/brain/StatusBadge'
import { DomainBadge } from '@/components/brain/DomainBadge'
import { WeightDots } from '@/components/brain/WeightDots'
import { UserAvatar } from '@/components/brain/UserAvatar'
import type {
  BrainEntry,
  BrainEntryType,
  BrainEntryDomain,
  BrainEntryStatus,
} from '@/lib/brain/brain-types'

type SortKey = 'updated' | 'alpha' | 'type' | 'weight'

export default function BrainPage() {
  // TODO: wire to API — GET /api/brain
  const [entries] = useState<BrainEntry[]>(MOCK_BRAIN_ENTRIES)
  const stats = MOCK_BRAIN_STATS
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<BrainEntryType | null>(null)
  const [domainFilter, setDomainFilter] = useState<BrainEntryDomain | null>(null)
  const [statusFilter, setStatusFilter] = useState<BrainEntryStatus>('ACTIVE')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const filtered = useMemo(() => {
    let result = entries

    if (statusFilter) {
      result = result.filter((e) => e.status === statusFilter)
    }
    if (typeFilter) {
      result = result.filter((e) => e.type === typeFilter)
    }
    if (domainFilter) {
      result = result.filter((e) => e.domain === domainFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    const sorted = [...result]
    switch (sortKey) {
      case 'alpha':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'type':
        sorted.sort((a, b) => a.type.localeCompare(b.type))
        break
      case 'weight': {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
        sorted.sort((a, b) => order[a.aiContextWeight] - order[b.aiContextWeight])
        break
      }
      default:
        sorted.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
    }

    return sorted
  }, [entries, statusFilter, typeFilter, domainFilter, search, sortKey])

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<BrainEntryType, number>> = {}
    for (const e of entries) {
      counts[e.type] = (counts[e.type] || 0) + 1
    }
    return counts
  }, [entries])

  const { domainCounts, coveredDomains, maxDomainCount } = useMemo(() => {
    const counts: Partial<Record<BrainEntryDomain, number>> = {}
    for (const e of entries) {
      counts[e.domain] = (counts[e.domain] || 0) + 1
    }
    const values = Object.values(counts)
    return {
      domainCounts: counts,
      coveredDomains: values.filter((c) => c > 0).length,
      maxDomainCount: Math.max(...values, 1),
    }
  }, [entries])

  const latestUpdate = useMemo(
    () =>
      entries.length > 0
        ? entries.reduce((latest, e) =>
            new Date(e.updatedAt) > new Date(latest.updatedAt) ? e : latest
          ).updatedAt
        : null,
    [entries]
  )

  function clearFilters() {
    setSearch('')
    setTypeFilter(null)
    setDomainFilter(null)
  }

  const hasActiveFilters = !!search || !!typeFilter || !!domainFilter

  if (stats.total === 0) {
    return <EmptyState />
  }

  const totalDomains = Object.keys(DOMAIN_LABELS).length

  const filterPanel = (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search entries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-lg"
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Filter by Type
        </p>
        <div className="space-y-0.5">
          <FilterButton
            active={typeFilter === null}
            onClick={() => setTypeFilter(null)}
            label="All Types"
            count={entries.length}
          />
          {(Object.keys(TYPE_CONFIG) as BrainEntryType[]).map((type) => (
            <FilterButton
              key={type}
              active={typeFilter === type}
              onClick={() => setTypeFilter(type)}
              label={TYPE_CONFIG[type].label}
              count={typeCounts[type] || 0}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Filter by Domain
        </p>
        <div className="space-y-0.5">
          <FilterButton
            active={domainFilter === null}
            onClick={() => setDomainFilter(null)}
            label="All Domains"
          />
          {(Object.keys(DOMAIN_LABELS) as BrainEntryDomain[]).map((domain) => {
            const count = domainCounts[domain] || 0
            return (
              <FilterButton
                key={domain}
                active={domainFilter === domain}
                onClick={() => setDomainFilter(domain)}
                label={DOMAIN_LABELS[domain]}
                count={count}
                dimmed={count === 0}
              />
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          AI Coverage
        </p>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <span className="text-xs text-slate-500">
            {coveredDomains} of {totalDomains} domains covered
          </span>
          <div className="w-full bg-slate-100 rounded-full h-1.5 my-2">
            <div
              className="bg-orange-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(coveredDomains / totalDomains) * 100}%` }}
            />
          </div>
          <div className="flex items-end gap-1 h-8">
            {(Object.keys(DOMAIN_LABELS) as BrainEntryDomain[]).map((domain) => {
              const count = domainCounts[domain] || 0
              const height = count > 0 ? Math.max((count / maxDomainCount) * 100, 15) : 5
              return (
                <div
                  key={domain}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${height}%`,
                    backgroundColor: count > 0 ? '#F97316' : '#E2E8F0',
                  }}
                  title={`${DOMAIN_LABELS[domain]}: ${count}`}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operational Brain</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {stats.activeCount} active entries
            {latestUpdate && <> &middot; last updated {formatRelativeTime(latestUpdate)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/brain/change-requests" className="relative">
              Change Requests
              {stats.pendingChangeRequests > 0 && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-orange-500 inline-block" />
              )}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/brain/new">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Entry
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Entries" value={stats.activeCount} icon={CheckCircle} iconColor="text-emerald-500" />
        <StatCard label="Rules & Policies" value={stats.byType.RULE} icon={TYPE_CONFIG.RULE.icon} iconColor="text-blue-500" />
        <StatCard label="Processes" value={stats.byType.PROCESS} icon={TYPE_CONFIG.PROCESS.icon} iconColor="text-purple-500" />
        <StatCard label="Constraints" value={stats.byType.CONSTRAINT} icon={TYPE_CONFIG.CONSTRAINT.icon} iconColor="text-red-500" />
      </div>

      <div className="md:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-orange-500" />}
        </Button>
      </div>

      {mobileFiltersOpen && (
        <div className="md:hidden bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-900">Filters</span>
            <button onClick={() => setMobileFiltersOpen(false)}>
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          {filterPanel}
        </div>
      )}

      <div className="flex gap-6">
        <div className="hidden md:block w-[240px] shrink-0 sticky top-0 self-start">
          {filterPanel}
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {(['ACTIVE', 'DRAFT', 'ARCHIVED'] as BrainEntryStatus[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                      statusFilter === status
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                )
              )}
            </div>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600"
            >
              <option value="updated">Last updated</option>
              <option value="alpha">A–Z</option>
              <option value="type">Type</option>
              <option value="weight">AI Weight</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500">No entries match your filters.</p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EntryCard({ entry }: { entry: BrainEntry }) {
  const config = TYPE_CONFIG[entry.type]
  return (
    <Link href={`/brain/${entry.id}`} className="block group">
      <div
        className="bg-white border border-slate-200 rounded-xl p-4 transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        style={{ borderLeftWidth: 4, borderLeftColor: config.color }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <TypeBadge type={entry.type} />
              <DomainBadge domain={entry.domain} />
              <div className="flex-1" />
              <StatusBadge status={entry.status} />
              <WeightDots weight={entry.aiContextWeight} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">{entry.title}</h3>
            <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">{entry.summary}</p>
            <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-400">
              <UserAvatar name={entry.owner.name} size="sm" />
              <span className="text-slate-600">{entry.owner.name}</span>
              <span>&middot;</span>
              <span>v{entry.version}</span>
              <span>&middot;</span>
              <span>Updated {formatRelativeTime(entry.updatedAt)}</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors shrink-0 mt-2" />
        </div>
      </div>
    </Link>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string
  value: number
  icon: React.ElementType
  iconColor: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 relative">
      <Icon className={cn('w-8 h-8 absolute top-4 right-4 opacity-20', iconColor)} />
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  label,
  count,
  dimmed,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  dimmed?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-all text-left',
        active
          ? 'text-orange-600 bg-orange-50 border-l-2 border-orange-500 font-medium'
          : dimmed
            ? 'text-slate-300 hover:text-slate-500'
            : 'text-slate-600 hover:bg-slate-50'
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span className={cn('text-xs', active ? 'text-orange-500' : 'text-slate-400')}>
          {count}
        </span>
      )}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="py-20 text-center max-w-2xl mx-auto">
      <div className="flex justify-center mb-6">
        <div className="w-28 h-28 relative">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            <circle cx="30" cy="60" r="8" fill="none" stroke="#F97316" strokeWidth="2" />
            <circle cx="60" cy="30" r="8" fill="none" stroke="#F97316" strokeWidth="2" />
            <circle cx="90" cy="60" r="8" fill="none" stroke="#F97316" strokeWidth="2" />
            <circle cx="60" cy="90" r="8" fill="none" stroke="#F97316" strokeWidth="2" />
            <circle cx="60" cy="60" r="6" fill="#F97316" opacity="0.3" />
            <line x1="38" y1="55" x2="52" y2="38" stroke="#F97316" strokeWidth="1.5" opacity="0.4" />
            <line x1="68" y1="38" x2="82" y2="55" stroke="#F97316" strokeWidth="1.5" opacity="0.4" />
            <line x1="82" y1="65" x2="68" y2="82" stroke="#F97316" strokeWidth="1.5" opacity="0.4" />
            <line x1="52" y1="82" x2="38" y2="65" stroke="#F97316" strokeWidth="1.5" opacity="0.4" />
            <line x1="38" y1="60" x2="54" y2="60" stroke="#F97316" strokeWidth="1.5" opacity="0.3" />
            <line x1="66" y1="60" x2="82" y2="60" stroke="#F97316" strokeWidth="1.5" opacity="0.3" />
            <line x1="60" y1="38" x2="60" y2="54" stroke="#F97316" strokeWidth="1.5" opacity="0.3" />
            <line x1="60" y1="66" x2="60" y2="82" stroke="#F97316" strokeWidth="1.5" opacity="0.3" />
          </svg>
        </div>
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Your Operational Brain is empty</h2>
      <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
        Start capturing the rules, policies, and knowledge that run your operation.
        Once added, your AI will cite these in every answer.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 max-w-xl mx-auto">
        <Link href="/brain/new?type=RULE&domain=INVENTORY" className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all">
          <p className="text-sm font-semibold text-slate-900 mb-1">Add a reorder policy</p>
          <p className="text-xs text-slate-500">Define when and how much to reorder</p>
        </Link>
        <Link href="/brain/new?type=CONSTRAINT&domain=PROCUREMENT" className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all">
          <p className="text-sm font-semibold text-slate-900 mb-1">Add a supplier limit</p>
          <p className="text-xs text-slate-500">Capture lead times, MOQs, or exposure limits</p>
        </Link>
        <Link href="/brain/new?type=PROCESS&domain=PRODUCTION" className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all">
          <p className="text-sm font-semibold text-slate-900 mb-1">Add an SOP</p>
          <p className="text-xs text-slate-500">Document how your team handles key situations</p>
        </Link>
      </div>

      <Button asChild size="lg">
        <Link href="/brain/new">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Your First Entry
        </Link>
      </Button>
    </div>
  )
}

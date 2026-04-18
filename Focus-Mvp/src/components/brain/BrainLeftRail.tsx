'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  MOCK_BRAIN_ENTRIES,
  MOCK_FOLDERS,
  MOCK_BRAIN_STATS,
  type BrainFolder,
} from '@/lib/brain/mock-data'
import { DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { getMockStaleness } from '@/lib/brain/brain-utils'
import type { BrainEntryDomain } from '@/lib/brain/brain-types'

interface DomainGroup {
  domain: BrainEntryDomain
  label: string
  folders: BrainFolder[]
  entryCount: number
}

export function BrainLeftRail({ onSearch }: { onSearch: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeFolder = searchParams.get('folder')
  const activeEntryId = pathname.match(/\/brain\/([^/]+)/)?.[1]

  // TODO: wire to API
  const groups = useMemo(() => {
    const result: DomainGroup[] = []
    for (const [domain, label] of Object.entries(DOMAIN_LABELS)) {
      const folders = MOCK_FOLDERS.filter((f) => f.domain === domain)
      const entryCount = MOCK_BRAIN_ENTRIES.filter((e) => e.domain === domain).length
      result.push({ domain: domain as BrainEntryDomain, label, folders, entryCount })
    }
    return result
  }, [])

  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const g of groups) {
      if (g.entryCount > 0) init[g.domain] = true
    }
    return init
  })

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const f of MOCK_FOLDERS) {
      if (f.id === activeFolder || f.entryIds.includes(activeEntryId ?? '')) {
        init[f.id] = true
      }
    }
    if (Object.keys(init).length === 0) {
      for (const f of MOCK_FOLDERS) init[f.id] = true
    }
    return init
  })

  const toggleDomain = useCallback((domain: string) => {
    setExpandedDomains((prev) => ({ ...prev, [domain]: !prev[domain] }))
  }, [])

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }, [])

  const stats = MOCK_BRAIN_STATS

  return (
    <aside className="w-[236px] shrink-0 bg-[#F8FAFC] flex flex-col h-full" style={{ borderRight: '0.5px solid #E2E8F0' }}>
      <div className="px-3.5 pt-3 pb-2">
        <p className="text-[13px] font-medium text-[#0F172A] mb-2">Operational Brain</p>
        <button
          onClick={onSearch}
          className="w-full flex items-center justify-between bg-white border rounded-md px-2.5 py-1.5 text-left hover:border-[#CBD5E1] transition-colors"
          style={{ borderColor: '#E2E8F0', borderWidth: '0.5px' }}
        >
          <span className="text-xs text-[#94A3B8]">Find anything...</span>
          <kbd className="font-mono text-[10px] bg-slate-100 border border-[#E2E8F0] rounded px-1 py-px text-[#94A3B8]">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {groups.map((group) => {
          const isEmpty = group.entryCount === 0
          const expanded = !!expandedDomains[group.domain]

          return (
            <div key={group.domain}>
              {isEmpty ? (
                <div className="flex items-center px-3.5 py-[5px] opacity-40">
                  <span className="w-3.5" />
                  <span className="text-xs font-medium text-[#475569]">{group.label}</span>
                  <span className="ml-auto text-[11px] text-[#94A3B8] tabular-nums">0</span>
                </div>
              ) : (
                <button
                  onClick={() => toggleDomain(group.domain)}
                  className="w-full flex items-center px-3.5 py-[5px] hover:bg-white transition-colors group/domain"
                >
                  <span className={cn('text-[9px] text-[#94A3B8] w-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}>▸</span>
                  <span className="text-xs font-medium text-[#475569]">{group.label}</span>
                  <span className="ml-auto text-[11px] text-[#94A3B8] tabular-nums">{group.entryCount}</span>
                </button>
              )}

              {expanded && !isEmpty && group.folders.map((folder) => {
                const fExpanded = !!expandedFolders[folder.id]
                const isActive = activeFolder === folder.id
                const entries = MOCK_BRAIN_ENTRIES.filter((e) => folder.entryIds.includes(e.id))

                return (
                  <div key={folder.id}>
                    <button
                      onClick={() => {
                        toggleFolder(folder.id)
                        router.push(`/brain?folder=${folder.id}`)
                      }}
                      className={cn(
                        'w-full flex items-center pl-7 pr-3.5 py-1 hover:bg-white transition-colors',
                        isActive && 'bg-[#FFF7ED]'
                      )}
                    >
                      <span className={cn('text-[9px] text-[#94A3B8] w-3.5 shrink-0 transition-transform', fExpanded && 'rotate-90')}>▸</span>
                      <span className={cn('text-xs truncate', isActive ? 'font-medium text-[#0F172A]' : 'text-[#475569]')}>
                        {folder.name}
                      </span>
                      <span className="ml-auto text-[11px] text-[#94A3B8] tabular-nums shrink-0">{entries.length}</span>
                    </button>

                    {fExpanded && entries.map((entry) => {
                      const isEntryActive = activeEntryId === entry.id
                      const staleness = getMockStaleness(entry.id)
                      return (
                        <button
                          key={entry.id}
                          onClick={() => router.push(`/brain/${entry.id}`)}
                          className={cn(
                            'w-full text-left pl-14 pr-3.5 py-[3px] truncate text-xs transition-colors',
                            isEntryActive ? 'bg-[#FFF7ED] text-[#0F172A]' : 'text-[#94A3B8] hover:text-[#475569]'
                          )}
                        >
                          {staleness !== 'fresh' && <span className="text-amber-500 mr-1">&middot;</span>}
                          {entry.title}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="px-3.5 py-2.5 text-[11px] text-[#94A3B8]" style={{ borderTop: '0.5px solid #E2E8F0' }}>
        {stats.activeCount} active &middot; {stats.draftCount} draft &middot; {stats.pendingChangeRequests} pending
        {stats.pendingChangeRequests > 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#EA580C] ml-1 align-middle" />}
      </div>
    </aside>
  )
}

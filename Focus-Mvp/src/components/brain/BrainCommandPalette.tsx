'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MOCK_BRAIN_ENTRIES, MOCK_FOLDERS, MOCK_RECENT_ENTRY_IDS, MOCK_BRAIN_STATS } from '@/lib/brain/mock-data'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'

interface Result {
  id: string
  type: 'entry' | 'folder' | 'action'
  label: string
  meta?: string
  href: string
  dotColor?: string
}

export function BrainCommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results: Result[] = (() => {
    if (query.trim()) {
      const q = query.toLowerCase()
      const entryResults: Result[] = MOCK_BRAIN_ENTRIES
        .filter((e) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
        .slice(0, 6)
        .map((e) => ({
          id: e.id,
          type: 'entry' as const,
          label: e.title,
          meta: `${TYPE_CONFIG[e.type].label} · ${DOMAIN_LABELS[e.domain]}`,
          href: `/brain/${e.id}`,
          dotColor: TYPE_CONFIG[e.type].color,
        }))
      const folderResults: Result[] = MOCK_FOLDERS
        .filter((f) => f.name.toLowerCase().includes(q))
        .slice(0, 2)
        .map((f) => ({
          id: f.id,
          type: 'folder' as const,
          label: f.name,
          meta: `${DOMAIN_LABELS[f.domain]} · ${f.entryIds.length} entries`,
          href: `/brain?folder=${f.id}`,
        }))
      return [...entryResults, ...folderResults].slice(0, 8)
    }
    return []
  })()

  const quickActions: Result[] = [
    { id: 'add', type: 'action', label: 'Add entry', href: '/brain/new' },
    { id: 'cr', type: 'action', label: 'View change requests', meta: `${MOCK_BRAIN_STATS.pendingChangeRequests} pending`, href: '/brain/change-requests' },
  ]

  const recentEntries: Result[] = MOCK_RECENT_ENTRY_IDS
    .map((id) => MOCK_BRAIN_ENTRIES.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => ({
      id: e!.id,
      type: 'entry' as const,
      label: e!.title,
      meta: `${TYPE_CONFIG[e!.type].label} · ${DOMAIN_LABELS[e!.domain]}`,
      href: `/brain/${e!.id}`,
      dotColor: TYPE_CONFIG[e!.type].color,
    }))

  const allItems = query.trim() ? results : [...quickActions, ...recentEntries]

  const navigate = useCallback((href: string) => {
    router.push(href)
    onClose()
  }, [router, onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && allItems[highlightIndex]) {
      navigate(allItems[highlightIndex].href)
    }
  }

  useEffect(() => { setHighlightIndex(0) }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/25 transition-opacity duration-100" />
      <div
        className="relative w-full max-w-[480px] bg-white rounded-xl border border-[#E2E8F0] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3.5 border-b border-[#E2E8F0]">
          <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find entries, folders, actions..."
            className="flex-1 px-3 py-3 text-sm bg-transparent outline-none placeholder:text-[#94A3B8] text-[#0F172A]"
          />
          <kbd className="font-mono text-[10px] text-[#94A3B8] bg-slate-100 border border-[#E2E8F0] rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[340px] overflow-y-auto py-1">
          {query.trim() ? (
            results.length === 0 ? (
              <p className="px-3.5 py-6 text-sm text-[#94A3B8] text-center">No results for &ldquo;{query}&rdquo;</p>
            ) : (
              results.map((item, i) => (
                <PaletteRow key={item.id} item={item} highlighted={i === highlightIndex} onClick={() => navigate(item.href)} />
              ))
            )
          ) : (
            <>
              <SectionLabel>Quick actions</SectionLabel>
              {quickActions.map((item, i) => (
                <PaletteRow key={item.id} item={item} highlighted={i === highlightIndex} onClick={() => navigate(item.href)} />
              ))}
              <SectionLabel>Recently viewed</SectionLabel>
              {recentEntries.map((item, i) => (
                <PaletteRow key={item.id} item={item} highlighted={i + quickActions.length === highlightIndex} onClick={() => navigate(item.href)} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#94A3B8] font-medium">{children}</p>
}

function PaletteRow({ item, highlighted, onClick }: { item: Result; highlighted: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3.5 py-[7px] text-left transition-colors',
        highlighted ? 'bg-slate-50' : 'hover:bg-slate-50'
      )}
    >
      {item.dotColor && <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: item.dotColor }} />}
      {item.type === 'action' && <span className="text-[13px] text-[#94A3B8]">+</span>}
      <span className="text-[13px] text-[#0F172A] truncate">{item.label}</span>
      {item.meta && <span className="text-xs text-[#94A3B8] ml-auto shrink-0">{item.meta}</span>}
    </button>
  )
}

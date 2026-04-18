'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import type { EntryFlag } from '@/lib/brain/mock-data'
import { formatRelativeTime } from '@/lib/brain/brain-utils'

export function BrainFlagThread({
  flags: initialFlags,
  entryId,
}: {
  flags: EntryFlag[]
  entryId: string
}) {
  const toast = useToast()
  const [flags, setFlags] = useState(initialFlags)
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('')

  const openFlags = flags.filter((f) => !f.resolved)

  function handleResolve(flagId: string) {
    // TODO: PATCH /api/brain/flags/[flagId]
    setFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, resolved: true } : f))
    toast.success('Flag resolved.')
  }

  function handleSubmit() {
    if (!note.trim()) return
    // TODO: POST /api/brain/[entryId]/flags
    const newFlag: EntryFlag = {
      id: `flag-${Date.now()}`,
      entryId,
      note: note.trim(),
      authorId: 'user-001',
      authorName: 'You',
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    setFlags((prev) => [newFlag, ...prev])
    setNote('')
    setShowForm(false)
    toast.success('Flag added. The entry owner has been notified.')
    console.log('Flag submitted:', { entryId, note: note.trim() })
  }

  if (openFlags.length === 0 && !showForm) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-[#0F172A]">
          Flags{openFlags.length > 0 && <span className="text-[#94A3B8] font-normal ml-1.5">{openFlags.length} open</span>}
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-[#475569] hover:text-[#0F172A] transition-colors"
        >
          + Flag this entry
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-4 mb-3">
          <p className="text-xs font-medium text-[#475569] mb-2">What&apos;s your concern with this entry?</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-lg text-sm mb-3"
            placeholder="Describe the issue..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setNote('') }}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!note.trim()}>Submit flag</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {openFlags.map((flag) => {
          const initials = flag.authorName.split(' ').map((n) => n[0]).join('').slice(0, 2)
          return (
            <div key={flag.id} className="bg-white border border-[#E2E8F0] rounded-lg p-3 pl-4 border-l-[3px] border-l-amber-400">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-[9px] font-medium text-slate-600">{initials}</span>
                  </div>
                  <span className="text-xs text-[#475569]">{flag.authorName}</span>
                  <span className="text-xs text-[#94A3B8]">&middot; {formatRelativeTime(flag.createdAt)}</span>
                </div>
                <button
                  onClick={() => handleResolve(flag.id)}
                  className="text-xs text-[#94A3B8] hover:text-emerald-600 transition-colors"
                >
                  Resolve ✓
                </button>
              </div>
              <p className="text-[13px] text-[#0F172A] leading-relaxed">{flag.note}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { MOCK_BRAIN_ENTRIES } from '@/lib/brain/mock-data'
import { TypeBadge } from '@/components/brain/TypeBadge'

export function ImportTab() {
  const router = useRouter()
  const toast = useToast()
  const [pasteContent, setPasteContent] = useState('')
  const [step, setStep] = useState<'input' | 'loading' | 'results'>('input')
  const [selected, setSelected] = useState<Record<string, boolean>>({
    'brain-001': true,
    'brain-002': true,
    'brain-003': true,
  })

  const mockExtracted = MOCK_BRAIN_ENTRIES.slice(0, 3)

  function handleExtract() {
    if (!pasteContent.trim()) return
    setStep('loading')
    // TODO: wire to API — POST /api/brain/import
    setTimeout(() => setStep('results'), 2000)
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  function handleImport() {
    // TODO: wire to API — POST /api/brain/import
    toast.success(`${selectedCount} entries imported as Draft`)
    router.push('/brain')
  }

  if (step === 'input' || step === 'loading') {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">
            Import from a document, email, or spreadsheet
          </Label>
          <p className="text-xs text-slate-400 mt-0.5">
            Paste any content below — a policy doc, an email thread, meeting notes, a spreadsheet export. Focus AI will identify and extract individual knowledge entries.
          </p>
        </div>

        <Textarea
          value={pasteContent}
          onChange={(e) => setPasteContent(e.target.value)}
          placeholder="Paste content here..."
          className="min-h-64 font-mono text-sm rounded-xl p-4"
          disabled={step === 'loading'}
        />

        {step === 'loading' ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-500">Scanning for knowledge entries...</p>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={handleExtract} disabled={!pasteContent.trim()} className="gap-1.5">
              <Sparkles className="w-4 h-4" />
              Extract Entries
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={selectedCount === mockExtracted.length}
            onChange={(e) => {
              const val = e.target.checked
              const next: Record<string, boolean> = {}
              mockExtracted.forEach((entry) => { next[entry.id] = val })
              setSelected(next)
            }}
            className="rounded"
          />
          Select all
        </label>
        <span className="text-sm text-slate-400">{mockExtracted.length} entries found</span>
      </div>

      <div className="space-y-2">
        {mockExtracted.map((entry) => (
          <label
            key={entry.id}
            className={cn(
              'flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all',
              selected[entry.id] ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 bg-white'
            )}
          >
            <input
              type="checkbox"
              checked={!!selected[entry.id]}
              onChange={(e) => setSelected((s) => ({ ...s, [entry.id]: e.target.checked }))}
              className="mt-1 rounded"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <TypeBadge type={entry.type} />
                <span className="text-sm font-semibold text-slate-900">{entry.title}</span>
              </div>
              <p className="text-sm text-slate-500 line-clamp-2">{entry.summary}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={() => setStep('input')}>&larr; Back</Button>
        <Button onClick={handleImport} disabled={selectedCount === 0}>
          Import Selected ({selectedCount})
        </Button>
      </div>
    </div>
  )
}

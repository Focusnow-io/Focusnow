'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { MOCK_BRAIN_ENTRIES, MOCK_FOLDERS } from '@/lib/brain/mock-data'
import { WeightSegmentedControl } from '@/components/brain/WeightSegmentedControl'
import { TagInput } from '@/components/brain/TagInput'
import { DynamicListSection } from '@/components/brain/DynamicListSection'
import type {
  BrainEntryType,
  BrainEntryDomain,
  AIContextWeight,
} from '@/lib/brain/brain-types'

export function WriteTab({ preFolderId }: { preFolderId?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input')
  const [nlInput, setNlInput] = useState('')

  const demo = MOCK_BRAIN_ENTRIES[0]
  const [form, setForm] = useState(() => ({
    type: demo.type as BrainEntryType,
    domain: demo.domain as BrainEntryDomain,
    title: demo.title,
    summary: demo.summary,
    body: demo.body,
    conditions: [...demo.conditions],
    actions: [...demo.actions],
    exceptions: [...demo.exceptions],
    aiContextWeight: demo.aiContextWeight as AIContextWeight,
    tags: [...demo.tags],
    effectiveDate: demo.effectiveDate || '',
    folderId: preFolderId || '',
  }))

  function handleStructure() {
    if (nlInput.trim().length < 20) return
    setStep('loading')
    // TODO: replace with actual API call to /api/brain/ai-parse
    setTimeout(() => setStep('preview'), 1500)
  }

  function handleSave(status: 'DRAFT' | 'ACTIVE') {
    // TODO: wire to API — POST /api/brain
    console.log('Save payload:', { ...form, status })
    toast.success(
      status === 'DRAFT'
        ? 'Entry saved as Draft (demo mode — not persisted)'
        : 'Entry published (demo mode — not persisted)'
    )
    router.push('/brain/brain-001')
  }

  if (step === 'input' || step === 'loading') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-[#0F172A]">Describe any rule, policy, constraint, or process in plain language.</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">Write it the way you&apos;d explain it to a new hire. Don&apos;t worry about format.</p>
        </div>

        <div className="relative">
          <Textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder={`For example:\n\n"We never place a PO with any single supplier for more than 40% of our category spend. This is a hard rule — no exceptions without CEO approval. It came from a bad experience in 2021 when our main plastics supplier had a factory fire and we had 78% concentration with them."`}
            className="min-h-[180px] resize-y text-sm rounded-xl p-4 border-[#E2E8F0]"
            disabled={step === 'loading'}
          />
          <span className="absolute bottom-3 right-3 text-xs text-[#94A3B8]">{nlInput.length}</span>
        </div>

        {step === 'loading' ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-5 h-5 text-[#EA580C] animate-spin" />
            <p className="text-sm text-[#475569]">Structuring your knowledge...</p>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              onClick={handleStructure}
              disabled={nlInput.trim().length < 20}
              className="bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm"
            >
              ✦ Structure with AI →
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:divide-x md:divide-[#E2E8F0]">
        <div>
          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-2">Your input</p>
          <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-4 text-xs text-[#94A3B8] italic min-h-[120px]">
            {nlInput}
          </div>
          <button onClick={() => setStep('input')} className="text-xs text-[#94A3B8] hover:text-[#475569] mt-2">← Edit</button>
        </div>

        <div className="md:pl-6 space-y-3">
          <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wide mb-2">Structured by AI</p>

          <div className="grid grid-cols-2 gap-3">
            <FieldSelect label="Type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as BrainEntryType }))} options={Object.entries(TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))} />
            <FieldSelect label="Domain" value={form.domain} onChange={(v) => setForm((f) => ({ ...f, domain: v as BrainEntryDomain }))} options={Object.entries(DOMAIN_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
          </div>

          <FieldWithCounter label="Title" value={form.title} max={80} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
          <FieldWithCounter label="Summary" value={form.summary} max={200} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} textarea rows={2} />

          <div className="space-y-1">
            <Label className="text-xs text-[#475569]">Body</Label>
            <Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} className="rounded-lg font-mono text-xs" />
          </div>

          <DynamicListSection title="Conditions" items={form.conditions} onChange={(items) => setForm((f) => ({ ...f, conditions: items }))} />
          <DynamicListSection title="Actions" items={form.actions} onChange={(items) => setForm((f) => ({ ...f, actions: items }))} />
          <DynamicListSection title="Exceptions" items={form.exceptions} onChange={(items) => setForm((f) => ({ ...f, exceptions: items }))} />

          <div className="space-y-1">
            <Label className="text-xs text-[#475569]">AI Context Weight</Label>
            <WeightSegmentedControl value={form.aiContextWeight} onChange={(w) => setForm((f) => ({ ...f, aiContextWeight: w }))} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-[#475569]">Tags</Label>
            <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-[#475569]">Folder</Label>
            <Select value={form.folderId} onValueChange={(v) => setForm((f) => ({ ...f, folderId: v }))}>
              <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select folder..." /></SelectTrigger>
              <SelectContent>
                {MOCK_FOLDERS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{DOMAIN_LABELS[f.domain]} / {f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E2E8F0]">
        <SaveButtons onSave={handleSave} />
      </div>
    </div>
  )
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-[#475569]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FieldWithCounter({ label, value, max, onChange, textarea, rows }: { label: string; value: string; max: number; onChange: (v: string) => void; textarea?: boolean; rows?: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-[#475569]">{label}</Label>
        <span className="text-xs text-[#94A3B8]">{value.length}/{max}</span>
      </div>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, max))} rows={rows} className="rounded-lg text-sm" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value.slice(0, max))} className="rounded-lg text-sm" />
      )}
    </div>
  )
}

export function SaveButtons({ onSave }: { onSave: (status: 'DRAFT' | 'ACTIVE') => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => onSave('DRAFT')}>Save as Draft</Button>
      <Button size="sm" onClick={() => onSave('ACTIVE')}>Publish as Active</Button>
    </div>
  )
}

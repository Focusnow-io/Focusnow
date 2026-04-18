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
import { Sparkles, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { MOCK_BRAIN_ENTRIES } from '@/lib/brain/mock-data'
import { WeightSegmentedControl } from '@/components/brain/WeightSegmentedControl'
import { TagInput } from '@/components/brain/TagInput'
import { DynamicListSection } from '@/components/brain/DynamicListSection'
import type {
  BrainEntryType,
  BrainEntryDomain,
  AIContextWeight,
} from '@/lib/brain/brain-types'

export function WriteTab() {
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
          <Label className="text-sm font-medium text-slate-700">
            Describe your operational knowledge in plain language
          </Label>
          <p className="text-xs text-slate-400 mt-0.5">
            Don&apos;t worry about format. Explain it the way you&apos;d tell a new employee.
          </p>
        </div>

        <div className="relative">
          <Textarea
            value={nlInput}
            onChange={(e) => setNlInput(e.target.value)}
            placeholder={`For example:\n\n"We never place a PO with any single supplier for more than 40% of our category spend. This is a hard rule — no exceptions without CEO approval. It came from a painful experience in 2021 when our main plastics supplier had a factory fire and we had 78% concentration with them."`}
            className="min-h-48 resize-y text-base rounded-xl p-4"
            disabled={step === 'loading'}
          />
          <span className="absolute bottom-3 right-3 text-xs text-slate-400">
            {nlInput.length} chars
          </span>
        </div>

        {step === 'loading' ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-500">Structuring your operational knowledge...</p>
            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={handleStructure} disabled={nlInput.trim().length < 20} className="gap-1.5">
              <Sparkles className="w-4 h-4" />
              Structure with AI
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Your input
          </Label>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 min-h-40">
            {nlInput}
          </div>
          <button onClick={() => setStep('input')} className="text-sm text-orange-600 hover:underline mt-2">
            &larr; Edit
          </button>
        </div>

        <div className="space-y-4">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Structured by AI — review and edit
          </Label>

          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <FieldSelect
                label="Type *"
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v as BrainEntryType }))}
                options={Object.keys(TYPE_CONFIG).map((k) => ({ value: k, label: TYPE_CONFIG[k as BrainEntryType].label }))}
              />
              <FieldSelect
                label="Domain *"
                value={form.domain}
                onChange={(v) => setForm((f) => ({ ...f, domain: v as BrainEntryDomain }))}
                options={Object.keys(DOMAIN_LABELS).map((k) => ({ value: k, label: DOMAIN_LABELS[k as BrainEntryDomain] }))}
              />
            </div>

            <FieldInput
              label="Title *"
              value={form.title}
              maxLength={80}
              onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            />
            <FieldTextarea
              label="Summary *"
              value={form.summary}
              maxLength={200}
              rows={2}
              onChange={(v) => setForm((f) => ({ ...f, summary: v }))}
            />
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Body</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={5}
                className="rounded-lg font-mono text-sm"
              />
            </div>

            <DynamicListSection title="Conditions" items={form.conditions} onChange={(items) => setForm((f) => ({ ...f, conditions: items }))} />
            <DynamicListSection title="Actions" items={form.actions} onChange={(items) => setForm((f) => ({ ...f, actions: items }))} />
            <DynamicListSection title="Exceptions" items={form.exceptions} onChange={(items) => setForm((f) => ({ ...f, exceptions: items }))} />

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">AI Context Weight</Label>
              <WeightSegmentedControl value={form.aiContextWeight} onChange={(w) => setForm((f) => ({ ...f, aiContextWeight: w }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Tags</Label>
              <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} className="rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={() => setStep('input')}>&larr; Back to input</Button>
        <SaveButtons onSave={handleSave} />
      </div>
    </div>
  )
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FieldInput({ label, value, maxLength, onChange }: { label: string; value: string; maxLength: number; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-500">{label}</Label>
        <span className="text-xs text-slate-400">{value.length}/{maxLength}</span>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLength))} className="rounded-lg" />
    </div>
  )
}

function FieldTextarea({ label, value, maxLength, rows, onChange }: { label: string; value: string; maxLength: number; rows: number; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-500">{label}</Label>
        <span className="text-xs text-slate-400">{value.length}/{maxLength}</span>
      </div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLength))} rows={rows} className="rounded-lg" />
    </div>
  )
}

export function SaveButtons({ onSave }: { onSave: (status: 'DRAFT' | 'ACTIVE') => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => onSave('DRAFT')}>Save as Draft</Button>
      <Button onClick={() => onSave('ACTIVE')}>Publish as Active</Button>
    </div>
  )
}

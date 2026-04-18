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
import { Plus, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { TYPE_CONFIG, DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { WeightSegmentedControl } from '@/components/brain/WeightSegmentedControl'
import { TagInput } from '@/components/brain/TagInput'
import { DynamicListSection } from '@/components/brain/DynamicListSection'
import { MOCK_FOLDERS } from '@/lib/brain/mock-data'
import { SaveButtons } from './WriteTab'
import type {
  BrainEntryType,
  BrainEntryDomain,
  AIContextWeight,
} from '@/lib/brain/brain-types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'] as const

export function FormTab({
  preType,
  preDomain,
  preFolderId,
}: {
  preType?: BrainEntryType
  preDomain?: BrainEntryDomain
  preFolderId?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState({
    type: preType || ('' as BrainEntryType | ''),
    domain: preDomain || ('' as BrainEntryDomain | ''),
    folderId: preFolderId || '',
    title: '',
    summary: '',
    body: '',
    conditions: [''],
    actions: [''],
    exceptions: [''],
    steps: [''],
    counterparty: '',
    leadTime: '',
    moq: '',
    moqCurrency: 'USD',
    paymentTerms: '',
    aiContextWeight: 'MEDIUM' as AIContextWeight,
    effectiveDate: '',
    expiryDate: '',
    noExpiry: true,
    tags: [] as string[],
  })

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function handleSave(status: 'DRAFT' | 'ACTIVE') {
    // TODO: wire to API — POST /api/brain
    console.log('Form save:', { ...form, status })
    toast.success(
      status === 'DRAFT'
        ? 'Entry saved as Draft (demo mode — not persisted)'
        : 'Entry published (demo mode — not persisted)'
    )
    router.push('/brain')
  }

  return (
    <div className="space-y-8">
      <FormSection title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Type *</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v as BrainEntryType)}>
              <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_CONFIG) as BrainEntryType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Domain *</Label>
            <Select value={form.domain} onValueChange={(v) => set('domain', v as BrainEntryDomain)}>
              <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select domain..." /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DOMAIN_LABELS) as BrainEntryDomain[]).map((d) => (
                  <SelectItem key={d} value={d}>{DOMAIN_LABELS[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Folder</Label>
            <Select value={form.folderId} onValueChange={(v) => set('folderId', v)}>
              <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select folder..." /></SelectTrigger>
              <SelectContent>
                {MOCK_FOLDERS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{DOMAIN_LABELS[f.domain]} / {f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Content">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">Title *</Label>
              <span className="text-xs text-slate-400">{form.title.length}/80</span>
            </div>
            <Input value={form.title} onChange={(e) => set('title', e.target.value.slice(0, 80))} placeholder="Short, descriptive title" className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">Summary *</Label>
              <span className="text-xs text-slate-400">{form.summary.length}/200</span>
            </div>
            <Textarea value={form.summary} onChange={(e) => set('summary', e.target.value.slice(0, 200))} placeholder="One sentence about what this means in practice" rows={2} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Body</Label>
            <Textarea value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Full description in plain language or Markdown" rows={6} className="rounded-lg" />
          </div>
        </div>
      </FormSection>

      {(form.type === 'RULE' || form.type === 'CONSTRAINT') && (
        <FormSection title="Structure">
          <div className="space-y-4">
            <DynamicListSection title="Conditions" subtitle="When does this apply?" items={form.conditions} onChange={(items) => set('conditions', items)} />
            <DynamicListSection title="Actions" subtitle="What must happen?" items={form.actions} onChange={(items) => set('actions', items)} />
            <DynamicListSection title="Exceptions" subtitle="When does this NOT apply?" items={form.exceptions} onChange={(items) => set('exceptions', items)} />
          </div>
        </FormSection>
      )}

      {form.type === 'PROCESS' && (
        <FormSection title="Steps">
          <OrderedListBuilder items={form.steps} onChange={(items) => set('steps', items)} />
        </FormSection>
      )}

      {form.type === 'AGREEMENT' && (
        <FormSection title="Agreement Details">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Counterparty</Label>
              <Input value={form.counterparty} onChange={(e) => set('counterparty', e.target.value)} placeholder="Supplier or partner name" className="rounded-lg" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Lead Time (days)</Label>
                <Input type="number" value={form.leadTime} onChange={(e) => set('leadTime', e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">MOQ</Label>
                <div className="flex gap-1">
                  <Input type="number" value={form.moq} onChange={(e) => set('moq', e.target.value)} className="rounded-lg flex-1" />
                  <Select value={form.moqCurrency} onValueChange={(v) => set('moqCurrency', v)}>
                    <SelectTrigger className="w-20 rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Payment Terms</Label>
                <Input value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} placeholder="e.g. Net-30" className="rounded-lg" />
              </div>
            </div>
          </div>
        </FormSection>
      )}

      <FormSection title="Governance">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">AI Context Weight</Label>
            <WeightSegmentedControl value={form.aiContextWeight} onChange={(w) => set('aiContextWeight', w)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Expiry Date</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={form.noExpiry} onChange={(e) => set('noExpiry', e.target.checked)} className="rounded" />
                  No expiry
                </label>
                {!form.noExpiry && (
                  <Input type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className="rounded-lg" />
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Tags</Label>
            <TagInput tags={form.tags} onChange={(tags) => set('tags', tags)} />
          </div>
        </div>
      </FormSection>

      <div className="flex items-center justify-end pt-4 border-t border-slate-200">
        <SaveButtons onSave={handleSave} />
      </div>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function OrderedListBuilder({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">{i + 1}.</span>
          <span className="text-slate-300 cursor-grab">&#8801;</span>
          <Input value={item} onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next) }} placeholder={`Step ${i + 1}`} className="rounded-lg flex-1 text-sm" />
          <button type="button" onClick={() => { const next = items.filter((_, j) => j !== i); onChange(next.length > 0 ? next : ['']) }} className="text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className="text-xs text-orange-600 hover:underline flex items-center gap-1 ml-10">
        <Plus className="w-3 h-3" />
        Add step
      </button>
    </div>
  )
}

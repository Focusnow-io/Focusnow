'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  X,
  CheckCircle,
  Lock,
  GitBranch,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { TYPE_CONFIG, DOMAIN_LABELS, WEIGHT_CONFIG } from '@/lib/brain/brain-config'
import { MOCK_BRAIN_ENTRIES } from '@/lib/brain/mock-data'
import type {
  BrainEntryType,
  BrainEntryDomain,
  AIContextWeight,
} from '@/lib/brain/brain-types'

type TabId = 'write' | 'form' | 'import'

export default function NewEntryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('write')

  const preType = (searchParams.get('type') as BrainEntryType) || undefined
  const preDomain = (searchParams.get('domain') as BrainEntryDomain) || undefined

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/brain"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Operational Brain
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Add to Operational Brain
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Capture any rule, policy, constraint, process, or knowledge your team
          operates by.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {([
            { id: 'write', label: 'Write' },
            { id: 'form', label: 'Form' },
            { id: 'import', label: 'Import' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'pb-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'write' && <WriteTab />}
      {activeTab === 'form' && (
        <FormTab preType={preType} preDomain={preDomain} />
      )}
      {activeTab === 'import' && <ImportTab />}
    </div>
  )
}

// ─── Tab 1: Write ───────────────────────────────────────────────

function WriteTab() {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input')
  const [nlInput, setNlInput] = useState('')

  // Structured form state (pre-filled after "AI" parse)
  const demo = MOCK_BRAIN_ENTRIES[0]
  const [form, setForm] = useState({
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
  })

  function handleStructure() {
    if (nlInput.trim().length < 20) return
    setStep('loading')
    // TODO: replace with actual API call to /api/brain/ai-parse
    setTimeout(() => setStep('preview'), 1500)
  }

  async function handleSave(status: 'DRAFT' | 'ACTIVE') {
    // TODO: wire to API — POST /api/brain
    const payload = { ...form, status }
    console.log('Save payload:', payload)
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
            Don&apos;t worry about format. Explain it the way you&apos;d tell a
            new employee.
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
            <p className="text-sm text-slate-500">
              Structuring your operational knowledge...
            </p>
            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              onClick={handleStructure}
              disabled={nlInput.trim().length < 20}
              className="gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Structure with AI
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Step 2: Structured Preview
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Original input */}
        <div>
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Your input
          </Label>
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 min-h-40">
            {nlInput}
          </div>
          <button
            onClick={() => setStep('input')}
            className="text-sm text-orange-600 hover:underline mt-2"
          >
            &larr; Edit
          </button>
        </div>

        {/* Right: Structured result */}
        <div className="space-y-4">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Structured by AI — review and edit
          </Label>

          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Type *</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as BrainEntryType }))
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_CONFIG) as BrainEntryType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_CONFIG[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Domain *</Label>
                <Select
                  value={form.domain}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, domain: v as BrainEntryDomain }))
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOMAIN_LABELS) as BrainEntryDomain[]).map(
                      (d) => (
                        <SelectItem key={d} value={d}>
                          {DOMAIN_LABELS[d]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-500">Title *</Label>
                <span className="text-xs text-slate-400">
                  {form.title.length}/80
                </span>
              </div>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value.slice(0, 80) }))
                }
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-500">Summary *</Label>
                <span className="text-xs text-slate-400">
                  {form.summary.length}/200
                </span>
              </div>
              <Textarea
                value={form.summary}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    summary: e.target.value.slice(0, 200),
                  }))
                }
                rows={2}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Body</Label>
              <Textarea
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                rows={5}
                className="rounded-lg font-mono text-sm"
              />
            </div>

            {/* Collapsible sections */}
            <DynamicListSection
              title="Conditions"
              items={form.conditions}
              onChange={(items) => setForm((f) => ({ ...f, conditions: items }))}
            />
            <DynamicListSection
              title="Actions"
              items={form.actions}
              onChange={(items) => setForm((f) => ({ ...f, actions: items }))}
            />
            <DynamicListSection
              title="Exceptions"
              items={form.exceptions}
              onChange={(items) => setForm((f) => ({ ...f, exceptions: items }))}
            />

            {/* AI Context Weight */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">AI Context Weight</Label>
              <WeightSegmentedControl
                value={form.aiContextWeight}
                onChange={(w) =>
                  setForm((f) => ({ ...f, aiContextWeight: w }))
                }
              />
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Tags</Label>
              <TagInput
                tags={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
              />
            </div>

            {/* Effective Date */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Effective Date</Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effectiveDate: e.target.value }))
                }
                className="rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={() => setStep('input')}>
          &larr; Back to input
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave('DRAFT')}>
            Save as Draft
          </Button>
          <Button onClick={() => handleSave('ACTIVE')}>Publish as Active</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 2: Form ────────────────────────────────────────────────

function FormTab({
  preType,
  preDomain,
}: {
  preType?: BrainEntryType
  preDomain?: BrainEntryDomain
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState({
    type: preType || ('' as BrainEntryType | ''),
    domain: preDomain || ('' as BrainEntryDomain | ''),
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

  const showRuleFields = form.type === 'RULE' || form.type === 'CONSTRAINT'
  const showProcessFields = form.type === 'PROCESS'
  const showAgreementFields = form.type === 'AGREEMENT'

  async function handleSave(status: 'DRAFT' | 'ACTIVE') {
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
      {/* Section: Identity */}
      <FormSection title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Type *</Label>
            <Select
              value={form.type}
              onValueChange={(v) => set('type', v as BrainEntryType)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_CONFIG) as BrainEntryType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_CONFIG[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              Domain *
            </Label>
            <Select
              value={form.domain}
              onValueChange={(v) => set('domain', v as BrainEntryDomain)}
            >
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select domain..." />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOMAIN_LABELS) as BrainEntryDomain[]).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DOMAIN_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      {/* Section: Content */}
      <FormSection title="Content">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">
                Title *
              </Label>
              <span className="text-xs text-slate-400">
                {form.title.length}/80
              </span>
            </div>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value.slice(0, 80))}
              placeholder="Short, descriptive title"
              className="rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-600">
                Summary *
              </Label>
              <span className="text-xs text-slate-400">
                {form.summary.length}/200
              </span>
            </div>
            <Textarea
              value={form.summary}
              onChange={(e) => set('summary', e.target.value.slice(0, 200))}
              placeholder="One sentence about what this means in practice"
              rows={2}
              className="rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Body</Label>
            <Textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder="Full description in plain language or Markdown"
              rows={6}
              className="rounded-lg"
            />
          </div>
        </div>
      </FormSection>

      {/* Section: Structure — conditional */}
      {showRuleFields && (
        <FormSection title="Structure">
          <div className="space-y-4">
            <DynamicListSection
              title="Conditions"
              subtitle="When does this apply?"
              items={form.conditions}
              onChange={(items) => set('conditions', items)}
            />
            <DynamicListSection
              title="Actions"
              subtitle="What must happen?"
              items={form.actions}
              onChange={(items) => set('actions', items)}
            />
            <DynamicListSection
              title="Exceptions"
              subtitle="When does this NOT apply?"
              items={form.exceptions}
              onChange={(items) => set('exceptions', items)}
            />
          </div>
        </FormSection>
      )}

      {showProcessFields && (
        <FormSection title="Steps">
          <OrderedListBuilder
            items={form.steps}
            onChange={(items) => set('steps', items)}
          />
        </FormSection>
      )}

      {showAgreementFields && (
        <FormSection title="Agreement Details">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Counterparty
              </Label>
              <Input
                value={form.counterparty}
                onChange={(e) => set('counterparty', e.target.value)}
                placeholder="Supplier or partner name"
                className="rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  Lead Time (days)
                </Label>
                <Input
                  type="number"
                  value={form.leadTime}
                  onChange={(e) => set('leadTime', e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">MOQ</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    value={form.moq}
                    onChange={(e) => set('moq', e.target.value)}
                    className="rounded-lg flex-1"
                  />
                  <Select
                    value={form.moqCurrency}
                    onValueChange={(v) => set('moqCurrency', v)}
                  >
                    <SelectTrigger className="w-20 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['USD', 'EUR', 'GBP', 'ILS'].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  Payment Terms
                </Label>
                <Input
                  value={form.paymentTerms}
                  onChange={(e) => set('paymentTerms', e.target.value)}
                  placeholder="e.g. Net-30"
                  className="rounded-lg"
                />
              </div>
            </div>
          </div>
        </FormSection>
      )}

      {/* Section: Governance */}
      <FormSection title="Governance">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              AI Context Weight
            </Label>
            <WeightSegmentedControl
              value={form.aiContextWeight}
              onChange={(w) => set('aiContextWeight', w)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Effective Date
              </Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => set('effectiveDate', e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Expiry Date
              </Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={form.noExpiry}
                    onChange={(e) => set('noExpiry', e.target.checked)}
                    className="rounded"
                  />
                  No expiry
                </label>
                {!form.noExpiry && (
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => set('expiryDate', e.target.value)}
                    className="rounded-lg"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Tags</Label>
            <TagInput
              tags={form.tags}
              onChange={(tags) => set('tags', tags)}
            />
          </div>
        </div>
      </FormSection>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
        <Button variant="outline" onClick={() => handleSave('DRAFT')}>
          Save as Draft
        </Button>
        <Button onClick={() => handleSave('ACTIVE')}>Publish as Active</Button>
      </div>
    </div>
  )
}

// ─── Tab 3: Import ──────────────────────────────────────────────

function ImportTab() {
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
            Paste any content below — a policy doc, an email thread, meeting
            notes, a spreadsheet export. Focus AI will identify and extract
            individual knowledge entries.
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
            <p className="text-sm text-slate-500">
              Scanning for knowledge entries...
            </p>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              onClick={handleExtract}
              disabled={!pasteContent.trim()}
              className="gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Extract Entries
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Results
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={selectedCount === mockExtracted.length}
              onChange={(e) => {
                const val = e.target.checked
                const next: Record<string, boolean> = {}
                mockExtracted.forEach((entry) => {
                  next[entry.id] = val
                })
                setSelected(next)
              }}
              className="rounded"
            />
            Select all
          </label>
          <span className="text-sm text-slate-400">
            {mockExtracted.length} entries found
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {mockExtracted.map((entry) => {
          const config = TYPE_CONFIG[entry.type]
          const Icon =
            entry.type === 'CONSTRAINT'
              ? Lock
              : entry.type === 'RULE'
                ? GitBranch
                : Lightbulb
          return (
            <label
              key={entry.id}
              className={cn(
                'flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all',
                selected[entry.id]
                  ? 'border-orange-300 bg-orange-50/50'
                  : 'border-slate-200 bg-white'
              )}
            >
              <input
                type="checkbox"
                checked={!!selected[entry.id]}
                onChange={(e) =>
                  setSelected((s) => ({ ...s, [entry.id]: e.target.checked }))
                }
                className="mt-1 rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                      config.tailwindBg,
                      config.tailwindText,
                      config.tailwindBorder
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {config.label}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {entry.title}
                  </span>
                </div>
                <p className="text-sm text-slate-500 line-clamp-2">
                  {entry.summary}
                </p>
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="ghost" onClick={() => setStep('input')}>
          &larr; Back
        </Button>
        <Button onClick={handleImport} disabled={selectedCount === 0}>
          Import Selected ({selectedCount})
        </Button>
      </div>
    </div>
  )
}

// ─── Shared Components ──────────────────────────────────────────

function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function DynamicListSection({
  title,
  subtitle,
  items,
  onChange,
}: {
  title: string
  subtitle?: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [open, setOpen] = useState(items.some((i) => i.length > 0))

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide"
      >
        <span className={cn('transition-transform', open && 'rotate-90')}>
          &#9656;
        </span>
        {title}
        {subtitle && (
          <span className="font-normal normal-case tracking-normal text-slate-400 ml-1">
            — {subtitle}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  onChange(next)
                }}
                placeholder={`${title} ${i + 1}`}
                className="rounded-lg flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const next = items.filter((_, j) => j !== i)
                  onChange(next.length > 0 ? next : [''])
                }}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...items, ''])}
            className="text-xs text-orange-600 hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      )}
    </div>
  )
}

function OrderedListBuilder({
  items,
  onChange,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 w-5 text-right shrink-0">
            {i + 1}.
          </span>
          <span className="text-slate-300 cursor-grab">&#8801;</span>
          <Input
            value={item}
            onChange={(e) => {
              const next = [...items]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={`Step ${i + 1}`}
            className="rounded-lg flex-1 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const next = items.filter((_, j) => j !== i)
              onChange(next.length > 0 ? next : [''])
            }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="text-xs text-orange-600 hover:underline flex items-center gap-1 ml-10"
      >
        <Plus className="w-3 h-3" />
        Add step
      </button>
    </div>
  )
}

function WeightSegmentedControl({
  value,
  onChange,
}: {
  value: AIContextWeight
  onChange: (w: AIContextWeight) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex rounded-lg overflow-hidden border border-slate-200">
        {(['HIGH', 'MEDIUM', 'LOW'] as AIContextWeight[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium transition-all',
              value === w
                ? 'bg-orange-500 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            )}
            title={WEIGHT_CONFIG[w].description}
          >
            {WEIGHT_CONFIG[w].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400 italic">
        {WEIGHT_CONFIG[value].description}
      </p>
    </div>
  )
}

function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState('')

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault()
            addTag(input)
          }
        }}
        onBlur={() => {
          if (input.trim()) addTag(input)
        }}
        placeholder="Type and press Enter to add tags"
        className="rounded-lg text-sm"
      />
    </div>
  )
}

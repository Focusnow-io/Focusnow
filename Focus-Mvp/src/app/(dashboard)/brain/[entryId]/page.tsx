'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import {
  MOCK_BRAIN_ENTRIES,
  MOCK_VERSION_HISTORY,
  MOCK_FLAGS,
  MOCK_FOLDERS,
} from '@/lib/brain/mock-data'
import { TYPE_CONFIG, DOMAIN_LABELS, WEIGHT_CONFIG } from '@/lib/brain/brain-config'
import {
  formatRelativeTime,
  formatShortDate,
  buildEntryPreview,
  getMockStaleness,
  slugify,
} from '@/lib/brain/brain-utils'
import { BrainTypeBadge } from '@/components/brain/BrainTypeBadge'
import { BrainWeightDots } from '@/components/brain/BrainWeightDots'
import { BrainStalenessTag } from '@/components/brain/BrainStalenessTag'
import { BrainFlagThread } from '@/components/brain/BrainFlagThread'
import { BrainVersionHistory } from '@/components/brain/BrainVersionHistory'
import type { BrainEntryStatus } from '@/lib/brain/brain-types'

export default function EntryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const entryId = params.entryId as string

  // TODO: wire to API — GET /api/brain/[entryId]
  const entry = MOCK_BRAIN_ENTRIES.find((e) => e.id === entryId)
  const [status, setStatus] = useState<BrainEntryStatus>(entry?.status ?? 'ACTIVE')
  const [showPropose, setShowPropose] = useState(false)
  const [aiContextOpen, setAiContextOpen] = useState(false)

  const versions = useMemo(
    () => MOCK_VERSION_HISTORY.filter((v) => v.entryId === entryId).sort((a, b) => b.version - a.version),
    [entryId]
  )
  const flags = useMemo(() => MOCK_FLAGS.filter((f) => f.entryId === entryId), [entryId])
  const folder = MOCK_FOLDERS.find((f) => f.entryIds.includes(entryId))
  const staleness = entry ? getMockStaleness(entry.id) : 'fresh'

  if (!entry) {
    return (
      <div className="py-16 text-center">
        <p className="text-[#94A3B8] mb-4">Entry not found</p>
        <Button variant="outline" asChild><Link href="/brain">Back to Brain</Link></Button>
      </div>
    )
  }

  const config = TYPE_CONFIG[entry.type]
  const domainLabel = DOMAIN_LABELS[entry.domain].toLowerCase()
  const folderSlug = folder ? slugify(folder.name) : 'uncategorized'
  const entrySlug = slugify(entry.title)
  const hasStructuredContent = entry.conditions.length > 0 || entry.actions.length > 0 || entry.exceptions.length > 0
  const initials = entry.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)

  function handleArchive() {
    // TODO: wire to PATCH /api/brain/[id]
    setStatus('ARCHIVED')
    toast.info('Entry archived.')
    console.log('Archive entry:', entryId)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#94A3B8]">
          <Link href="/brain" className="hover:text-[#475569] transition-colors">brain</Link>
          <span className="mx-1.5">/</span>
          <Link href="/brain" className="hover:text-[#475569] transition-colors">{domainLabel}</Link>
          <span className="mx-1.5">/</span>
          {folder && (
            <>
              <Link href={`/brain?folder=${folder.id}`} className="hover:text-[#475569] transition-colors">{folderSlug}</Link>
              <span className="mx-1.5">/</span>
            </>
          )}
          <span className="font-mono text-[#0F172A]">{entrySlug}</span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">Actions ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/brain/${entry.id}/edit`)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowPropose(true)}>Propose Change</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { toast.info('Flag form opened'); }}>Flag this entry</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info('Pinned — // TODO: wire to API')}>Pin / Unpin</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast.info('Duplicated as Draft — // TODO: wire to API')}>Duplicate as Draft</DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {staleness !== 'fresh' && (
        <div className={cn(
          'px-4 py-3 rounded-lg text-sm border-l-4',
          staleness === 'stale'
            ? 'bg-red-50 border-l-red-400 text-red-800'
            : 'bg-amber-50 border-l-amber-400 text-amber-800'
        )}>
          {staleness === 'stale'
            ? "This entry hasn't been reviewed in over 6 months. It may no longer reflect current operations."
            : `This entry is due for review. Last updated ${formatRelativeTime(entry.updatedAt)}.`}
          <span className="ml-3">
            <button onClick={() => toast.success('Marked as reviewed. Review date reset.')} className="underline text-xs mr-3">
              Mark as reviewed
            </button>
            <button onClick={() => setShowPropose(true)} className="underline text-xs">
              Propose update
            </button>
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <BrainTypeBadge type={entry.type} />
          <Badge variant="secondary" className="text-[10px]">{DOMAIN_LABELS[entry.domain]}</Badge>
          <Badge
            variant={status === 'ACTIVE' ? 'success' : status === 'DRAFT' ? 'warning' : 'outline'}
            className="text-[10px]"
          >
            {status.toLowerCase()}
          </Badge>
          <BrainStalenessTag level={staleness} updatedAt={entry.updatedAt} />
        </div>

        <h1 className="text-xl font-semibold text-[#0F172A]">{entry.title}</h1>
        <p className="text-sm text-[#475569] mt-1">{entry.summary}</p>

        <div className="flex items-center gap-2 mt-3 text-sm text-[#94A3B8] flex-wrap border-t border-[#E2E8F0] pt-3">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <span className="text-[9px] font-medium text-slate-600">{initials}</span>
          </div>
          <span className="text-[#475569]">{entry.owner.name}</span>
          <span>&middot;</span>
          <span>Version {entry.version}</span>
          <span>&middot;</span>
          <span>Updated {formatShortDate(entry.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-[#94A3B8]">
          <BrainWeightDots weight={entry.aiContextWeight} />
          <span>{WEIGHT_CONFIG[entry.aiContextWeight].label}</span>
          <span>&middot;</span>
          <span>Effective: {entry.effectiveDate ? formatShortDate(entry.effectiveDate) : 'Always'}</span>
          <span>&middot;</span>
          <span>{entry.expiryDate ? `Expires ${formatShortDate(entry.expiryDate)}` : 'No expiry'}</span>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
        <div className="prose prose-slate prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
        </div>
      </div>

      {hasStructuredContent && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {entry.conditions.length > 0 && (
            <StructuredPanel title="WHEN" titleColor={config.color} items={entry.conditions} />
          )}
          {entry.actions.length > 0 && (
            <StructuredPanel title="THEN" titleColor={config.color} items={entry.actions} />
          )}
          {entry.exceptions.length > 0 && (
            <StructuredPanel title="EXCEPT" titleColor="#64748B" items={entry.exceptions} />
          )}
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span key={tag} className="bg-slate-100 text-slate-600 text-xs rounded-full px-2.5 py-1">{tag}</span>
          ))}
        </div>
      )}

      <div className="border border-[#E2E8F0] rounded-xl overflow-hidden">
        <button
          onClick={() => setAiContextOpen(!aiContextOpen)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm text-[#475569] hover:bg-slate-50 transition-colors"
        >
          <span>
            <span className="mr-1">{aiContextOpen ? '▾' : '▸'}</span>
            AI context <span className="text-[#94A3B8]">&middot; how this entry shapes Focus AI answers</span>
          </span>
        </button>
        {aiContextOpen && (
          <div className="px-5 pb-5">
            <pre className="bg-[#0F172A] text-[#E2E8F0] font-mono text-[13px] p-5 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {buildEntryPreview(entry)}
            </pre>
            <p className="text-xs text-[#94A3B8] mt-3">
              When you ask Focus AI a question, answers shaped by this entry include a citation: <span className="font-medium text-[#475569]">[Brain: &ldquo;{entry.title}&rdquo;]</span>
            </p>
          </div>
        )}
      </div>

      <BrainVersionHistory versions={versions} onProposeChange={() => setShowPropose(true)} />

      <BrainFlagThread flags={flags} entryId={entry.id} />

      {showPropose && <ProposeChangeForm entryId={entry.id} onClose={() => setShowPropose(false)} />}
    </div>
  )
}

function StructuredPanel({ title, titleColor, items }: { title: string; titleColor: string; items: string[] }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-4" style={{ borderTopWidth: 3, borderTopColor: titleColor }}>
      <p className="text-[10px] font-medium uppercase tracking-widest mb-2" style={{ color: titleColor }}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-[#475569] flex items-start gap-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProposeChangeForm({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [proposedBody, setProposedBody] = useState('')

  function handleSubmit() {
    // TODO: POST /api/brain/[entryId]/change-requests
    console.log('Propose change:', { entryId, title, reason, proposedBody })
    toast.success('Proposal submitted. An admin will review your change request.')
    onClose()
  }

  return (
    <div className="bg-slate-50 border border-[#E2E8F0] rounded-xl p-5" style={{ transition: 'max-height 0.2s ease' }}>
      <p className="text-sm font-medium text-[#0F172A] mb-1">Propose a change to this entry</p>
      <div className="border-t border-[#E2E8F0] mt-2 pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#475569]">Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title for this proposal" className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#475569]">Why are you proposing this change? *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's changed, or what's wrong with the current version?" rows={3} className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#475569]">Proposed content *</Label>
          <Textarea value={proposedBody} onChange={(e) => setProposedBody(e.target.value)} placeholder="Paste the full updated entry body here" rows={5} className="rounded-lg" />
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !reason.trim() || !proposedBody.trim()}>
            Submit for review →
          </Button>
        </div>
      </div>
    </div>
  )
}

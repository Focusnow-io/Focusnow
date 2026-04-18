'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pencil,
  GitPullRequest,
  Copy,
  Archive,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { MOCK_BRAIN_ENTRIES, MOCK_VERSION_HISTORY } from '@/lib/brain/mock-data'
import { TYPE_CONFIG, WEIGHT_CONFIG } from '@/lib/brain/brain-config'
import { formatRelativeTime, formatShortDate, buildEntryPreview } from '@/lib/brain/brain-utils'
import { TypeBadge } from '@/components/brain/TypeBadge'
import { StatusBadge } from '@/components/brain/StatusBadge'
import { DomainBadge } from '@/components/brain/DomainBadge'
import { WeightDots } from '@/components/brain/WeightDots'
import { UserAvatar } from '@/components/brain/UserAvatar'
import { BrainBackLink } from '@/components/brain/BrainBackLink'
import type { BrainEntryStatus, AIContextWeight } from '@/lib/brain/brain-types'

export default function EntryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const entryId = params.entryId as string

  // TODO: wire to API — GET /api/brain/[entryId]
  const entry = MOCK_BRAIN_ENTRIES.find((e) => e.id === entryId)

  const [status, setStatus] = useState<BrainEntryStatus>(entry?.status ?? 'ACTIVE')
  const [showPropose, setShowPropose] = useState(false)
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({})

  const versions = useMemo(
    () => MOCK_VERSION_HISTORY.filter((v) => v.entryId === entryId).sort((a, b) => b.version - a.version),
    [entryId]
  )

  if (!entry) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-500 mb-4">Entry not found</p>
        <Button variant="outline" asChild>
          <Link href="/brain">Back to Brain</Link>
        </Button>
      </div>
    )
  }

  const config = TYPE_CONFIG[entry.type]
  const isExpired = entry.expiryDate && new Date(entry.expiryDate) < new Date()

  function handleArchive() {
    // TODO: wire to PATCH /api/brain/[id]
    setStatus('ARCHIVED')
    toast.info('Archived — // TODO: wire to API')
  }

  function handleDuplicate() {
    // TODO: wire to API
    toast.info('Duplicated as Draft — // TODO: wire to API')
  }

  function handleReactivate() {
    // TODO: wire to PATCH /api/brain/[id]
    setStatus('ACTIVE')
    toast.success('Entry reactivated')
  }

  const hasStructuredContent = entry.conditions.length > 0 || entry.actions.length > 0 || entry.exceptions.length > 0

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <BrainBackLink />

      {isExpired && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4" />
            This entry expired on {formatShortDate(entry.expiryDate!)} and is no longer included in AI answers.
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReactivate}>Reactivate</Button>
            <Button size="sm" variant="outline" onClick={handleArchive}>Archive</Button>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={entry.type} />
            <DomainBadge domain={entry.domain} />
            <StatusBadge status={status} />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                Actions
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/brain/${entry.id}/edit`)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowPropose(true)}>
                <GitPullRequest className="w-4 h-4 mr-2" />
                Propose Change
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mt-2">{entry.title}</h1>
        <p className="text-slate-500 text-base mt-1">{entry.summary}</p>

        <div className="flex items-center gap-2 mt-3 text-sm text-slate-400 flex-wrap">
          <UserAvatar name={entry.owner.name} size="md" />
          <span className="text-slate-600">{entry.owner.name}</span>
          <span>&middot;</span>
          <span>Version {entry.version}</span>
          <span>&middot;</span>
          <span>Updated {formatRelativeTime(entry.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
          <WeightDots weight={entry.aiContextWeight} />
          <span>{WEIGHT_CONFIG[entry.aiContextWeight].label}</span>
          <span>&middot;</span>
          <span>Effective: {entry.effectiveDate ? formatShortDate(entry.effectiveDate) : 'Always'}</span>
          <span>&middot;</span>
          <span>{entry.expiryDate ? `Expires ${formatShortDate(entry.expiryDate)}` : 'No expiry'}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 prose prose-slate prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
      </div>

      {hasStructuredContent && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {entry.conditions.length > 0 && (
            <StructuredPanel title="WHEN" items={entry.conditions} bgClass={config.tailwindBg} borderClass={config.tailwindBorder} />
          )}
          {entry.actions.length > 0 && (
            <StructuredPanel title="THEN" items={entry.actions} bgClass={config.tailwindBg} borderClass={config.tailwindBorder} />
          )}
          {entry.exceptions.length > 0 && (
            <StructuredPanel title="EXCEPT" items={entry.exceptions} bgClass="bg-slate-50" borderClass="border-slate-200" />
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

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">AI Context Preview</h3>
        <p className="text-xs text-slate-500 mb-4">How this entry appears to Focus AI in every conversation</p>
        <pre className="bg-slate-900 text-slate-100 font-mono text-sm p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
          {buildEntryPreview(entry)}
        </pre>
        <p className="text-xs text-slate-400 italic mt-3">
          When you ask Focus AI a question, answers are shaped by entries like this one — cited by name.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Version History</h3>
          <Button variant="outline" size="sm" onClick={() => setShowPropose(true)}>Propose Change</Button>
        </div>

        {versions.length === 0 ? (
          <p className="text-sm text-slate-400">No version history</p>
        ) : (
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
            <div className="space-y-6">
              {versions.map((v, i) => (
                <div key={v.id} className="relative pl-9">
                  <div className={cn(
                    'absolute left-1.5 w-3 h-3 rounded-full border-2 top-0.5',
                    i === 0 ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-300'
                  )} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">v{v.version}</span>
                      <span className="text-xs text-slate-500">{formatShortDate(v.createdAt)}</span>
                      <span className="text-xs text-slate-600">{v.changedBy.name}</span>
                      {v.version === 1 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Created</Badge>}
                    </div>
                    {v.changeNote && (
                      <p className="text-sm text-slate-600 italic mt-1">&ldquo;{v.changeNote}&rdquo;</p>
                    )}
                    {v.version > 1 && (
                      <button
                        type="button"
                        onClick={() => setExpandedVersions((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                        className="text-xs text-blue-600 hover:underline mt-1 flex items-center gap-1"
                      >
                        {expandedVersions[v.id] ? 'Hide diff' : 'View diff'}
                        <ChevronDown className={cn('w-3 h-3 transition-transform', expandedVersions[v.id] && 'rotate-180')} />
                      </button>
                    )}
                    {expandedVersions[v.id] && v.version > 1 && <DiffPanel version={v.version} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showPropose && <ProposeChangeSection entryId={entry.id} onClose={() => setShowPropose(false)} />}
    </div>
  )
}

function StructuredPanel({ title, items, bgClass, borderClass }: { title: string; items: string[]; bgClass: string; borderClass: string }) {
  return (
    <div className={cn('rounded-xl p-4 border', bgClass, borderClass)}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DiffPanel({ version }: { version: number }) {
  const diffs: Record<number, { before: string; after: string }> = {
    3: { before: '...no single supplier may exceed 35%...', after: '...no single supplier may exceed 40%...' },
    2: { before: '(No exception clause for thin supplier markets)', after: 'Categories with fewer than 3 qualified suppliers (documented exception required)' },
  }
  const diff = diffs[version]
  if (!diff) return null

  return (
    <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden text-sm">
      <div className="bg-red-50 px-3 py-2 text-red-800 border-b border-slate-200">
        <span className="font-mono text-xs text-red-500 mr-2">&minus;</span>
        {diff.before}
      </div>
      <div className="bg-green-50 px-3 py-2 text-green-800">
        <span className="font-mono text-xs text-green-500 mr-2">+</span>
        {diff.after}
      </div>
    </div>
  )
}

function ProposeChangeSection({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [proposedBody, setProposedBody] = useState('')

  function handleSubmit() {
    // TODO: wire to POST /api/brain/[entryId]/change-requests
    console.log('Propose change:', { entryId, title, reason, proposedBody })
    toast.success('Proposal submitted for review')
    onClose()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 animate-in slide-in-from-bottom-2 duration-200">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Propose a Change to This Entry</h3>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title for this change proposal" className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Reason *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this change be made?" rows={3} className="rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Proposed body *</Label>
          <Textarea value={proposedBody} onChange={(e) => setProposedBody(e.target.value)} placeholder="Paste the updated body content here" rows={5} className="rounded-lg" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!title.trim() || !reason.trim() || !proposedBody.trim()}>Submit Proposal</Button>
      </div>
    </div>
  )
}

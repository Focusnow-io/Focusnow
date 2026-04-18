'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MOCK_FOLDERS } from '@/lib/brain/mock-data'
import { DOMAIN_LABELS } from '@/lib/brain/brain-config'
import { WriteTab } from './_tabs/WriteTab'
import { FormTab } from './_tabs/FormTab'
import { ImportTab } from './_tabs/ImportTab'
import type { BrainEntryType, BrainEntryDomain } from '@/lib/brain/brain-types'

type TabId = 'write' | 'form' | 'import'

export default function NewEntryPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>('write')

  const preType = (searchParams.get('type') as BrainEntryType) || undefined
  const preDomain = (searchParams.get('domain') as BrainEntryDomain) || undefined
  const preFolderId = searchParams.get('folder') || undefined
  const preFolder = preFolderId ? MOCK_FOLDERS.find((f) => f.id === preFolderId) : undefined

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#94A3B8]">
          <Link href="/brain" className="hover:text-[#475569] transition-colors">brain</Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono text-[#0F172A]">{preFolder ? preFolder.name.toLowerCase().replace(/\s+/g, '-') : 'new'}</span>
        </p>
        <Link href="/brain" className="text-xs text-[#94A3B8] hover:text-[#475569] transition-colors">
          Cancel
        </Link>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { id: 'write' as const, label: 'Write' },
          { id: 'form' as const, label: 'Form' },
          { id: 'import' as const, label: 'Import' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-1.5 text-sm rounded-md transition-all',
              activeTab === tab.id
                ? 'bg-[#0F172A] text-white'
                : 'text-[#475569] hover:text-[#0F172A]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'write' && <WriteTab preFolderId={preFolderId} />}
      {activeTab === 'form' && <FormTab preType={preType} preDomain={preDomain} preFolderId={preFolderId} />}
      {activeTab === 'import' && <ImportTab />}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BrainBackLink } from '@/components/brain/BrainBackLink'
import { WriteTab } from './_tabs/WriteTab'
import { FormTab } from './_tabs/FormTab'
import { ImportTab } from './_tabs/ImportTab'
import type { BrainEntryType, BrainEntryDomain } from '@/lib/brain/brain-types'

type TabId = 'write' | 'form' | 'import'

const TABS = [
  { id: 'write' as const, label: 'Write' },
  { id: 'form' as const, label: 'Form' },
  { id: 'import' as const, label: 'Import' },
]

export default function NewEntryPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>('write')

  const preType = (searchParams.get('type') as BrainEntryType) || undefined
  const preDomain = (searchParams.get('domain') as BrainEntryDomain) || undefined

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <BrainBackLink />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add to Operational Brain</h1>
        <p className="text-sm text-slate-500 mt-1">
          Capture any rule, policy, constraint, process, or knowledge your team operates by.
        </p>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {TABS.map((tab) => (
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
      {activeTab === 'form' && <FormTab preType={preType} preDomain={preDomain} />}
      {activeTab === 'import' && <ImportTab />}
    </div>
  )
}

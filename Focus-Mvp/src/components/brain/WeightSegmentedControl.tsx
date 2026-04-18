'use client'

import { cn } from '@/lib/utils'
import { WEIGHT_CONFIG } from '@/lib/brain/brain-config'
import type { AIContextWeight } from '@/lib/brain/brain-types'

export function WeightSegmentedControl({
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

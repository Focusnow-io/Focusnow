import { cn } from '@/lib/utils'
import { WEIGHT_CONFIG } from '@/lib/brain/brain-config'
import type { AIContextWeight } from '@/lib/brain/brain-types'

export function BrainWeightDots({ weight }: { weight: AIContextWeight }) {
  const config = WEIGHT_CONFIG[weight]
  return (
    <div className="flex items-center gap-0.5" title={config.description}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-[6px] h-[6px] rounded-full',
            i < config.dotCount
              ? weight === 'LOW' ? 'bg-slate-300' : 'bg-[#EA580C]'
              : 'bg-slate-200'
          )}
        />
      ))}
    </div>
  )
}

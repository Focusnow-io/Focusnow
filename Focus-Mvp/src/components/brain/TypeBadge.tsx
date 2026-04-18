import { cn } from '@/lib/utils'
import { TYPE_CONFIG } from '@/lib/brain/brain-config'
import type { BrainEntryType } from '@/lib/brain/brain-types'

export function TypeBadge({ type }: { type: BrainEntryType }) {
  const config = TYPE_CONFIG[type]
  const Icon = config.icon
  return (
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
  )
}

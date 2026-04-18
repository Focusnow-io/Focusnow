import { TYPE_CONFIG } from '@/lib/brain/brain-config'
import type { BrainEntryType } from '@/lib/brain/brain-types'

const BADGE_STYLES: Record<BrainEntryType, string> = {
  RULE: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  PROCESS: 'bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]',
  CONSTRAINT: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
  KNOWLEDGE: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
  AGREEMENT: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
}

export function BrainTypeBadge({ type }: { type: BrainEntryType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${BADGE_STYLES[type]}`}>
      {TYPE_CONFIG[type].label}
    </span>
  )
}

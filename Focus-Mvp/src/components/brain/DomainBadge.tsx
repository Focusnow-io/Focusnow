import { Badge } from '@/components/ui/badge'
import { DOMAIN_LABELS } from '@/lib/brain/brain-config'
import type { BrainEntryDomain } from '@/lib/brain/brain-types'

export function DomainBadge({ domain }: { domain: BrainEntryDomain }) {
  return (
    <Badge variant="secondary" className="text-[10px]">
      {DOMAIN_LABELS[domain]}
    </Badge>
  )
}

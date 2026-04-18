import { Badge } from '@/components/ui/badge'
import type { BrainEntryStatus } from '@/lib/brain/brain-types'

const STATUS_VARIANT: Record<BrainEntryStatus, 'success' | 'warning' | 'outline'> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  ARCHIVED: 'outline',
}

export function StatusBadge({ status }: { status: BrainEntryStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="text-[10px]">
      {status.toLowerCase()}
    </Badge>
  )
}

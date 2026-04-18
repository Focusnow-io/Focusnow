import {
  GitBranch,
  ListOrdered,
  Lock,
  Lightbulb,
  Handshake,
} from 'lucide-react'
import type { BrainEntryType, BrainEntryDomain, AIContextWeight } from './brain-types'

export const TYPE_CONFIG: Record<BrainEntryType, {
  label: string
  color: string
  tailwindBg: string
  tailwindText: string
  tailwindBorder: string
  icon: React.ElementType
}> = {
  RULE:       { label: 'Rule & Policy',    color: '#3B82F6', tailwindBg: 'bg-blue-50',   tailwindText: 'text-blue-700',   tailwindBorder: 'border-blue-200',   icon: GitBranch   },
  PROCESS:    { label: 'Process & SOP',    color: '#8B5CF6', tailwindBg: 'bg-purple-50', tailwindText: 'text-purple-700', tailwindBorder: 'border-purple-200', icon: ListOrdered },
  CONSTRAINT: { label: 'Constraint',       color: '#EF4444', tailwindBg: 'bg-red-50',    tailwindText: 'text-red-700',    tailwindBorder: 'border-red-200',    icon: Lock        },
  KNOWLEDGE:  { label: 'Tribal Knowledge', color: '#F59E0B', tailwindBg: 'bg-amber-50',  tailwindText: 'text-amber-700',  tailwindBorder: 'border-amber-200',  icon: Lightbulb   },
  AGREEMENT:  { label: 'Agreement',        color: '#10B981', tailwindBg: 'bg-green-50',  tailwindText: 'text-green-700',  tailwindBorder: 'border-green-200',  icon: Handshake   },
}

export const DOMAIN_LABELS: Record<BrainEntryDomain, string> = {
  PROCUREMENT: 'Procurement',
  INVENTORY:   'Inventory',
  PRODUCTION:  'Production',
  PLANNING:    'Planning',
  LOGISTICS:   'Logistics',
  QUALITY:     'Quality',
  FINANCE:     'Finance',
  HR:          'HR',
  OTHER:       'Other',
}

export const WEIGHT_CONFIG: Record<AIContextWeight, {
  label: string
  description: string
  dotCount: number
  color: string
}> = {
  HIGH:   { label: 'HIGH',   description: 'AI must follow this strictly — treated as a hard constraint', dotCount: 3, color: '#F97316' },
  MEDIUM: { label: 'MED',    description: 'AI follows this as standard policy unless strong reason not to', dotCount: 2, color: '#F97316' },
  LOW:    { label: 'LOW',    description: 'AI considers this as soft guidance and uses judgment',          dotCount: 1, color: '#94A3B8' },
}

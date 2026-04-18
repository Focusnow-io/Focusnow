export type BrainEntryType = 'RULE' | 'PROCESS' | 'CONSTRAINT' | 'KNOWLEDGE' | 'AGREEMENT'
export type BrainEntryStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type BrainEntryDomain = 'PROCUREMENT' | 'INVENTORY' | 'PRODUCTION' | 'PLANNING' | 'LOGISTICS' | 'QUALITY' | 'FINANCE' | 'HR' | 'OTHER'
export type AIContextWeight = 'HIGH' | 'MEDIUM' | 'LOW'
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface BrainEntryOwner {
  id: string
  name: string
  image: string | null
}

export interface BrainEntry {
  id: string
  type: BrainEntryType
  domain: BrainEntryDomain
  status: BrainEntryStatus
  aiContextWeight: AIContextWeight
  title: string
  summary: string
  body: string
  conditions: string[]
  actions: string[]
  exceptions: string[]
  tags: string[]
  version: number
  effectiveDate: string | null
  expiryDate: string | null
  ownerId: string
  owner: BrainEntryOwner
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface BrainEntryVersion {
  id: string
  entryId: string
  version: number
  title: string
  body: string
  changeNote: string | null
  changedById: string
  changedBy: { id: string; name: string }
  createdAt: string
  aiContextWeight: AIContextWeight
  status: BrainEntryStatus
}

export interface ChangeRequest {
  id: string
  entryId: string
  entryTitle: string
  entryType: BrainEntryType
  title: string
  description: string
  proposedBody: string
  status: ChangeRequestStatus
  requestedById: string
  requestedBy: BrainEntryOwner
  reviewedById?: string
  reviewNote?: string
  createdAt: string
  updatedAt: string
}

export interface BrainStats {
  total: number
  activeCount: number
  draftCount: number
  byType: Record<BrainEntryType, number>
  byDomain: Record<BrainEntryDomain, number>
  pendingChangeRequests: number
}

export interface CostCodeResponseDto {
  id: number
  projectId: number
  code: string
  name: string
  isActive: boolean
  currentAllocation: number | null
  pendingCommitmentAmount: number | null
  approvedCommitmentAmount: number | null
  remainingAfterCommitments: number | null
}

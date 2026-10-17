import type { CostCodeResponseDto } from './CostCodeResponseDto'
import type { ProjectBudgetResponseDto } from './ProjectBudgetResponseDto'
import type { ProjectProgressVerificationResponseDto } from './ProjectProgressVerificationResponseDto'
import type { ProjectResponseDto } from './ProjectResponseDto'

export interface ProjectSummaryDto {
  canViewFinancials: boolean
  project: ProjectResponseDto
  currentBudget: ProjectBudgetResponseDto | null
  costCodes: CostCodeResponseDto[]
  latestProgress: ProjectProgressVerificationResponseDto | null
  progressVerificationCount: number
  pendingCommitmentAmount: number | null
  approvedCommitmentAmount: number | null
  remainingAfterCommitments: number | null
}

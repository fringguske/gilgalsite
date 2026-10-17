export interface BudgetAllocationResponseDto {
  costCodeId: number
  costCode: string
  costCodeName: string
  amount: number
}

export interface ProjectBudgetResponseDto {
  id: number
  projectId: number
  approvedAmount: number
  allocatedAmount: number
  /** ApprovedAmount - AllocatedAmount */
  unallocatedAmount: number
  approvedByUserId: number | null
  approvedByUserName: string | null
  approvalSource: string
  notes: string | null
  createdAt: Date
  allocations: BudgetAllocationResponseDto[]
}

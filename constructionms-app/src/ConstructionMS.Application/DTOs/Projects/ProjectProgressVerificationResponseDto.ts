export interface ProjectProgressVerificationResponseDto {
  id: number
  projectId: number
  percentageComplete: number
  workSummary: string
  evidenceReference: string | null
  verifiedByUserId: number
  verifiedByUserName: string
  verifiedAt: Date
}

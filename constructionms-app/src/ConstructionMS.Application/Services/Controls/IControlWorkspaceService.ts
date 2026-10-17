import type {
  CashAccountResponseDto,
  ControlledCorrectionResponseDto,
  CorrectionDecisionRequestDto,
  CreateControlledCorrectionRequestDto,
  CreateMaterialReturnRequestDto,
  CreateOpeningPositionRequestDto,
  CreateOperationalPeriodRequestDto,
  CustodyCloseoutResponseDto,
  MaterialIssueDisputeResolutionResponseDto,
  MaterialReturnResponseDto,
  OpeningPositionDecisionRequestDto,
  OpeningPositionResponseDto,
  OperationalPeriodResponseDto,
  PeriodActionRequestDto,
  PeriodDecisionRequestDto,
  ReceiveMaterialReturnRequestDto,
  ResolveMaterialIssueDisputeRequestDto,
  ReviewCustodyCloseoutRequestDto,
  SubmitCustodyCloseoutRequestDto,
} from '../../DTOs/Controls/ControlWorkspaceDtos'

export interface IControlWorkspaceService {
  getCashAccountsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<CashAccountResponseDto[]>
  getOpeningPositionsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<OpeningPositionResponseDto[]>
  createOpeningPositionAsync(request: CreateOpeningPositionRequestDto, actorUserId: number, actorRole: string): Promise<OpeningPositionResponseDto>
  verifyOpeningPositionAsync(id: number, request: OpeningPositionDecisionRequestDto, actorUserId: number, actorRole: string): Promise<OpeningPositionResponseDto>
  decideOpeningPositionAsync(id: number, request: OpeningPositionDecisionRequestDto, actorUserId: number, actorRole: string): Promise<OpeningPositionResponseDto>

  getMaterialReturnsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<MaterialReturnResponseDto[]>
  resolveMaterialIssueDisputeAsync(materialIssueId: number, request: ResolveMaterialIssueDisputeRequestDto, actorUserId: number, actorRole: string): Promise<MaterialIssueDisputeResolutionResponseDto>
  createMaterialReturnAsync(request: CreateMaterialReturnRequestDto, actorUserId: number, actorRole: string): Promise<MaterialReturnResponseDto>
  receiveMaterialReturnAsync(id: number, request: ReceiveMaterialReturnRequestDto, actorUserId: number, actorRole: string): Promise<MaterialReturnResponseDto>
  getCustodyCloseoutsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<CustodyCloseoutResponseDto[]>
  submitCustodyCloseoutAsync(request: SubmitCustodyCloseoutRequestDto, actorUserId: number, actorRole: string): Promise<CustodyCloseoutResponseDto>
  reviewCustodyCloseoutAsync(id: number, request: ReviewCustodyCloseoutRequestDto, actorUserId: number, actorRole: string): Promise<CustodyCloseoutResponseDto>

  getPeriodsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<OperationalPeriodResponseDto[]>
  createPeriodAsync(request: CreateOperationalPeriodRequestDto, actorUserId: number, actorRole: string): Promise<OperationalPeriodResponseDto>
  submitPeriodCloseAsync(id: number, request: PeriodActionRequestDto, actorUserId: number, actorRole: string): Promise<OperationalPeriodResponseDto>
  decidePeriodCloseAsync(id: number, request: PeriodDecisionRequestDto, actorUserId: number, actorRole: string): Promise<OperationalPeriodResponseDto>
  getCorrectionsAsync(actorUserId: number, actorRole: string, projectId?: number | null): Promise<ControlledCorrectionResponseDto[]>
  createCorrectionAsync(request: CreateControlledCorrectionRequestDto, actorUserId: number, actorRole: string): Promise<ControlledCorrectionResponseDto>
  decideCorrectionAsync(id: number, request: CorrectionDecisionRequestDto, actorUserId: number, actorRole: string): Promise<ControlledCorrectionResponseDto>
}

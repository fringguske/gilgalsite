import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  ConfirmPettyCashReceiptDto,
  CreatePettyCashRequestDto,
  DecidePettyCashRequestDto,
  DisbursePettyCashRequestDto,
  PettyCashRequestResponseDto,
  ReviewPettyCashReconciliationDto,
  SubmitPettyCashReconciliationDto,
} from '@/ConstructionMS.Application/DTOs/Finance/PettyCashDtos'

export interface IPettyCashService {
  getRequestsAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null, status?: string | null): Promise<PaginatedResult<PettyCashRequestResponseDto>>
  createRequestAsync(request: CreatePettyCashRequestDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
  decideRequestAsync(id: number, request: DecidePettyCashRequestDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
  disburseAsync(id: number, request: DisbursePettyCashRequestDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
  confirmReceiptAsync(id: number, request: ConfirmPettyCashReceiptDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
  submitReconciliationAsync(id: number, request: SubmitPettyCashReconciliationDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
  reviewReconciliationAsync(id: number, request: ReviewPettyCashReconciliationDto, actorUserId: number, actorRole: string): Promise<PettyCashRequestResponseDto>
}

import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  ConfirmMaterialIssueRequestDto,
  CreateStockCountRequestDto,
  CreateStockTransferRequestDto,
  GoodsReceiptResponseDto,
  IssueMaterialRequestDto,
  MaterialIssueResponseDto,
  ReceiveGoodsRequestDto,
  ReceiveStockTransferRequestDto,
  RecordMaterialUsageRequestDto,
  RecordTechnicalAcceptanceRequestDto,
  ResolveStockTransferDisputeRequestDto,
  ReviewStockCountRequestDto,
  StockBalanceResponseDto,
  StockCountResponseDto,
  StockLedgerEntryResponseDto,
  StockTransferResponseDto,
  TechnicalAcceptanceResponseDto,
} from '@/ConstructionMS.Application/DTOs/Inventory/InventoryDtos'

export interface IInventoryWorkflowService {
  getReceiptsAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null): Promise<PaginatedResult<GoodsReceiptResponseDto>>
  receiveGoodsAsync(request: ReceiveGoodsRequestDto, actorUserId: number, actorRole: string): Promise<GoodsReceiptResponseDto>
  getTechnicalAcceptancesAsync(
    page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null, status?: string | null): Promise<PaginatedResult<TechnicalAcceptanceResponseDto>>
  recordTechnicalAcceptanceAsync(
    receiptId: number, request: RecordTechnicalAcceptanceRequestDto, actorUserId: number, actorRole: string): Promise<TechnicalAcceptanceResponseDto>
  getBalancesAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null): Promise<PaginatedResult<StockBalanceResponseDto>>
  getLedgerAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null, materialId?: number | null): Promise<PaginatedResult<StockLedgerEntryResponseDto>>
  getIssuesAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null): Promise<PaginatedResult<MaterialIssueResponseDto>>
  issueMaterialAsync(request: IssueMaterialRequestDto, actorUserId: number, actorRole: string): Promise<MaterialIssueResponseDto>
  confirmIssueAsync(id: number, request: ConfirmMaterialIssueRequestDto, actorUserId: number, actorRole: string): Promise<MaterialIssueResponseDto>
  recordUsageAsync(id: number, request: RecordMaterialUsageRequestDto, actorUserId: number, actorRole: string): Promise<MaterialIssueResponseDto>
  getTransfersAsync(page: number, pageSize: number, actorUserId: number, actorRole: string): Promise<PaginatedResult<StockTransferResponseDto>>
  createTransferAsync(request: CreateStockTransferRequestDto, actorUserId: number, actorRole: string): Promise<StockTransferResponseDto>
  dispatchTransferAsync(id: number, actorUserId: number, actorRole: string): Promise<StockTransferResponseDto>
  receiveTransferAsync(id: number, request: ReceiveStockTransferRequestDto, actorUserId: number, actorRole: string): Promise<StockTransferResponseDto>
  resolveTransferDisputeAsync(id: number, request: ResolveStockTransferDisputeRequestDto, actorUserId: number, actorRole: string): Promise<StockTransferResponseDto>
  getCountsAsync(page: number, pageSize: number, actorUserId: number, actorRole: string): Promise<PaginatedResult<StockCountResponseDto>>
  createCountAsync(request: CreateStockCountRequestDto, actorUserId: number, actorRole: string): Promise<StockCountResponseDto>
  reviewCountAsync(id: number, request: ReviewStockCountRequestDto, actorUserId: number, actorRole: string): Promise<StockCountResponseDto>
}

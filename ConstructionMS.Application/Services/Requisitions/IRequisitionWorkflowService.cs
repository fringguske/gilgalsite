namespace ConstructionMS.Application.Services.Requisitions;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Requisitions.V1;

/// <summary>Authenticated v1 requisition workflow.</summary>
public interface IRequisitionWorkflowService
{
    Task<OperationResult<PaginatedResult<RequisitionWorkflowResponseDto>>> GetAllAsync(
        int actorUserId,
        int page,
        int pageSize,
        string? status,
        int? projectId,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> GetByIdAsync(
        int actorUserId,
        int requisitionId,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> CreateAsync(
        int actorUserId,
        CreateRequisitionV1RequestDto request,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> CreateStockReplenishmentAsync(
        int actorUserId,
        CreateStockReplenishmentRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> UpdateAsync(
        int actorUserId,
        int requisitionId,
        UpdateRequisitionV1RequestDto request,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> RecordTechnicalCheckAsync(
        int actorUserId,
        int requisitionId,
        TechnicalCheckRequestDto request,
        CancellationToken cancellationToken = default);

    Task<OperationResult<RequisitionWorkflowResponseDto>> RecordSupervisorDecisionAsync(
        int actorUserId,
        int requisitionId,
        SupervisorDecisionRequestDto request,
        CancellationToken cancellationToken = default);
}

namespace ConstructionMS.Application.Services.Requisitions;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Requisitions;

/// <summary>Business operations for material requisitions.</summary>
public interface IRequisitionService
{
    /// <summary>
    /// Returns a paginated, optionally filtered list of requisitions.
    /// </summary>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Items per page.</param>
    /// <param name="status">Optional filter: "Pending", "Approved" or "Rejected".</param>
    /// <param name="projectId">Optional filter to a single project.</param>
    Task<PaginatedResult<RequisitionResponseDto>> GetAllAsync(
        int page, int pageSize, string? status = null, int? projectId = null);

    Task<RequisitionResponseDto?> GetByIdAsync(int id);

    Task<RequisitionResponseDto> CreateAsync(CreateRequisitionRequestDto dto);

    /// <summary>
    /// Updates Quantity and Notes of a Pending requisition.
    /// Returns an error string if the requisition is not in Pending status
    /// (approved/rejected requisitions are effectively immutable).
    /// </summary>
    Task<(RequisitionResponseDto? dto, string? error)> UpdateAsync(int id, UpdateRequisitionRequestDto dto);

    /// <summary>
    /// Approves a Pending requisition.
    /// Enforces SoD: approvedByUserId must differ from the requisition's RequestedByUserId.
    /// Returns an error string on violation or invalid state.
    /// </summary>
    Task<(RequisitionResponseDto? dto, string? error)> ApproveAsync(int id, int approvedByUserId);

    /// <summary>
    /// Rejects a Pending requisition.
    /// Same SoD enforcement as ApproveAsync.
    /// </summary>
    Task<(RequisitionResponseDto? dto, string? error)> RejectAsync(int id, int approvedByUserId);
}

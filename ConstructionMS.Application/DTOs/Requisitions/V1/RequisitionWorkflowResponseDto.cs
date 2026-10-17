namespace ConstructionMS.Application.DTOs.Requisitions.V1;

/// <summary>Role-scoped view of a material requisition and its current workflow position.</summary>
public sealed class RequisitionWorkflowResponseDto
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public int CostCodeId { get; set; }
    public string CostCode { get; set; } = string.Empty;
    public string CostCodeName { get; set; } = string.Empty;
    public string RequestType { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public DateOnly NeededByDate { get; set; }
    public string Purpose { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string Status { get; set; } = string.Empty;
    public int WorkflowRevision { get; set; }
    public int? RequestedByUserId { get; set; }
    public string? RequestedByUserName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public TechnicalCheckResponseDto? LatestTechnicalCheck { get; set; }
    public int? DecidedByUserId { get; set; }
    public string? DecidedByUserName { get; set; }
    public string? CurrentActionMessage { get; set; }

    /// <summary>
    /// Full event history is populated only for executive/audit readers. Operational
    /// roles receive the current state and the evidence required for their own step.
    /// </summary>
    public IReadOnlyList<RequisitionWorkflowEventResponseDto> History { get; set; } = [];
}

public sealed class TechnicalCheckResponseDto
{
    public long Id { get; set; }
    public string Outcome { get; set; } = string.Empty;
    public string? Comments { get; set; }
    public int? EngineerUserId { get; set; }
    public string? EngineerName { get; set; }
    public DateTime CheckedAt { get; set; }
    public int RequisitionRevision { get; set; }
}

public sealed class RequisitionWorkflowEventResponseDto
{
    public int SequenceNumber { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public string? Comments { get; set; }
    public string EventDataJson { get; set; } = "{}";
    public DateTime OccurredAt { get; set; }
    public string EventHash { get; set; } = string.Empty;
}

namespace ConstructionMS.Application.DTOs.Requisitions;

/// <summary>Flat requisition projection with display names for related records.</summary>
public class RequisitionResponseDto
{
    public int Id { get; set; }

    public int ProjectId { get; set; }

    /// <summary>Denormalised from Project.Name for display without a second request.</summary>
    public string ProjectName { get; set; } = string.Empty;

    public int MaterialId { get; set; }

    /// <summary>Denormalised from Material.Name.</summary>
    public string MaterialName { get; set; } = string.Empty;

    /// <summary>Denormalised from Material.Unit (e.g. "bags", "m²").</summary>
    public string MaterialUnit { get; set; } = string.Empty;

    public decimal Quantity { get; set; }

    public int RequestedByUserId { get; set; }

    /// <summary>Denormalised from RequestedByUser.FullName.</summary>
    public string RequestedByUserName { get; set; } = string.Empty;

    public int? ApprovedByUserId { get; set; }

    /// <summary>Null until the requisition is actioned.</summary>
    public string? ApprovedByUserName { get; set; }

    /// <summary>One of: "Pending", "Approved" or "Rejected".</summary>
    public string Status { get; set; } = string.Empty;

    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>Set when Status moves to Approved or Rejected.</summary>
    public DateTime? ApprovedAt { get; set; }
}

namespace ConstructionMS.Application.DTOs.Requisitions;

using System.ComponentModel.DataAnnotations;

/// <summary>Temporary actor input for requisition approval and rejection.</summary>
public class ApproveRejectRequestDto
{
    /// <summary>ID of the acting user; must differ from the requester.</summary>
    [Range(1, int.MaxValue)]
    public int ApprovedByUserId { get; set; }
}

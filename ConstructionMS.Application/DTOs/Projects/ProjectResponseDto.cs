namespace ConstructionMS.Application.DTOs.Projects;

/// <summary>Construction project response.</summary>
public class ProjectResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Physical address or description of the site. Optional.</summary>
    public string? Location { get; set; }

    /// <summary>Null when the authenticated role is not allowed to view project finances.</summary>
    public decimal? Budget { get; set; }
    public DateOnly StartDate { get; set; }

    /// <summary>Null if the project is still active/ongoing.</summary>
    public DateOnly? EndDate { get; set; }

    /// <summary>One of: "Active", "On Hold", "Completed", "Cancelled".</summary>
    public string Status { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}

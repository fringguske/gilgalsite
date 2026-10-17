namespace ConstructionMS.Application.Configuration;

public sealed class EvidenceStorageOptions
{
    public const string SectionName = "EvidenceStorage";
    public const long AbsoluteMaximumFileBytes = 10 * 1024 * 1024;

    /// <summary>
    /// Private directory outside the web root. Relative paths are resolved from
    /// the API content root.
    /// </summary>
    public string RootPath { get; init; } = "App_Data/evidence";

    /// <summary>Deployment-configurable limit, capped by AbsoluteMaximumFileBytes.</summary>
    public long MaxFileBytes { get; init; } = AbsoluteMaximumFileBytes;
}

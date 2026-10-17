namespace ConstructionMS.Application.Configuration;

/// <summary>
/// Enables a named CEO account to inspect operational workspaces during the
/// development period. The option is disabled by default and never contains a
/// password; credentials remain normal user records protected by BCrypt.
/// </summary>
public sealed class ItVerificationOptions
{
    public const string SectionName = "ItVerification";

    public bool Enabled { get; init; }
    public int? TesterUserId { get; init; }
    public string TesterUsername { get; init; } = string.Empty;
}

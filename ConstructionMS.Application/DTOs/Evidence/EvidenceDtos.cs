namespace ConstructionMS.Application.DTOs.Evidence;

public sealed class EvidenceDocumentResponseDto
{
    public Guid Id { get; init; }
    public int ProjectId { get; init; }
    public string ProjectName { get; init; } = string.Empty;
    public string SourceType { get; init; } = string.Empty;
    public long SourceId { get; init; }
    public string EvidenceKind { get; init; } = string.Empty;
    public string OriginalFileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long SizeBytes { get; init; }
    public string Sha256Hash { get; init; } = string.Empty;
    public int UploadedByUserId { get; init; }
    public string UploadedByName { get; init; } = string.Empty;
    public DateTime UploadedAt { get; init; }
}

public sealed record EvidenceUploadCommand(
    string SourceType,
    long SourceId,
    string EvidenceKind,
    string OriginalFileName,
    string? ClaimedContentType,
    long DeclaredLength,
    Stream Content);

public sealed record StoredEvidenceFile(
    string StorageKey,
    string OriginalFileName,
    string ContentType,
    long SizeBytes,
    string Sha256Hash);

public sealed record EvidenceDownload(
    Stream Content,
    string ContentType,
    string FileName,
    long SizeBytes);

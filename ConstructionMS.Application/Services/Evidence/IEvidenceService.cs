namespace ConstructionMS.Application.Services.Evidence;

using ConstructionMS.Application.DTOs.Evidence;

public interface IEvidenceService
{
    Task<EvidenceDocumentResponseDto> UploadAsync(
        EvidenceUploadCommand command,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<EvidenceDocumentResponseDto>> GetForSourceAsync(
        string sourceType,
        long sourceId,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);

    Task<EvidenceDownload> OpenDownloadAsync(
        Guid documentId,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);
}

namespace ConstructionMS.Application.Services.Evidence;

using ConstructionMS.Application.DTOs.Evidence;

public interface IEvidenceStorage
{
    Task<StoredEvidenceFile> StoreAsync(
        Stream content,
        string originalFileName,
        string? claimedContentType,
        long declaredLength,
        CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task DeleteIfExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default);
}

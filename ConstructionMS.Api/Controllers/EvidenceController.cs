namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Configuration;
using ConstructionMS.Application.DTOs.Evidence;
using ConstructionMS.Application.Services.Evidence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

[ApiController]
[Authorize(Roles = "CEO,Supervisor,Engineer,Foreman,Storekeeper,Procurement Officer,Finance Officer,Auditor")]
[Route("api/v1/evidence")]
[Produces("application/json")]
public sealed class EvidenceController(IEvidenceService evidence) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = "Supervisor,Engineer,Foreman,Storekeeper,Procurement Officer,Finance Officer")]
    [EnableRateLimiting("evidence-upload")]
    [Consumes("multipart/form-data")]
    [RequestFormLimits(
        MultipartBodyLengthLimit = EvidenceStorageOptions.AbsoluteMaximumFileBytes + (64 * 1024),
        ValueLengthLimit = 4 * 1024)]
    [RequestSizeLimit(EvidenceStorageOptions.AbsoluteMaximumFileBytes + (64 * 1024))]
    public async Task<IActionResult> Upload(
        [FromForm] UploadEvidenceForm request,
        CancellationToken cancellationToken)
    {
        if (request.File is null || request.File.Length <= 0)
            throw new ArgumentException("A non-empty evidence file is required.", nameof(request.File));

        await using var content = request.File.OpenReadStream();
        var result = await evidence.UploadAsync(
            new EvidenceUploadCommand(
                request.SourceType,
                request.SourceId,
                request.EvidenceKind,
                request.File.FileName,
                request.File.ContentType,
                request.File.Length,
                content),
            ActorId(),
            Role(),
            cancellationToken);
        return Created(
            $"/api/v1/evidence/{result.Id:D}/content",
            ApiResponse<EvidenceDocumentResponseDto>.Ok(result));
    }

    [HttpGet("source/{sourceType}/{sourceId:long}")]
    public async Task<IActionResult> GetForSource(
        string sourceType,
        long sourceId,
        CancellationToken cancellationToken) =>
        Ok(ApiResponse<IReadOnlyList<EvidenceDocumentResponseDto>>.Ok(
            await evidence.GetForSourceAsync(
                sourceType,
                sourceId,
                ActorId(),
                Role(),
                cancellationToken)));

    [HttpGet("{documentId:guid}/content")]
    [Produces("application/pdf", "image/jpeg", "image/png", "image/webp")]
    public async Task<IActionResult> Download(
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var result = await evidence.OpenDownloadAsync(
            documentId,
            ActorId(),
            Role(),
            cancellationToken);
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.ContentSecurityPolicy = "sandbox";
        return File(
            result.Content,
            result.ContentType,
            result.FileName,
            enableRangeProcessing: false);
    }

    private int ActorId() => User.GetRequiredUserId();
    private string Role() => User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}

public sealed class UploadEvidenceForm
{
    [Required, StringLength(60)]
    public string SourceType { get; set; } = string.Empty;

    [Range(1, long.MaxValue)]
    public long SourceId { get; set; }

    [Required, StringLength(30)]
    public string EvidenceKind { get; set; } = string.Empty;

    [Required]
    public IFormFile? File { get; set; }
}

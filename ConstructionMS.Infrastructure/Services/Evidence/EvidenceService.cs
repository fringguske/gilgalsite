namespace ConstructionMS.Infrastructure.Services.Evidence;

using ConstructionMS.Application.DTOs.Evidence;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Evidence;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class EvidenceService : IEvidenceService
{
    private static readonly IReadOnlySet<string> ProjectReaders = Roles(
        "CEO", "Supervisor", "Engineer", "Foreman", "Storekeeper",
        "Procurement Officer", "Finance Officer", "Auditor");
    private static readonly IReadOnlySet<string> ReceiptReaders = Roles(
        "Storekeeper", "Procurement Officer", "Finance Officer", "Engineer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> TechnicalAcceptanceReaders = Roles(
        "Engineer", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> MaterialUsageReaders = Roles(
        "Storekeeper", "Foreman", "Supervisor", "Engineer", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> InvoiceReaders = Roles(
        "Procurement Officer", "Supervisor", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> PaymentReaders = Roles(
        "Supervisor", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> PettyCashReaders = Roles(
        "Supervisor", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> OpeningPositionReaders = Roles(
        "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> CustodyReaders = Roles(
        "Storekeeper", "Foreman", "Supervisor", "Engineer", "CEO", "Auditor");
    private static readonly IReadOnlySet<string> CorrectionReaders = Roles(
        "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");

    private static readonly IReadOnlySet<string> ProgressKinds = Kinds(
        EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> ReceiptKinds = Kinds(
        EvidenceKinds.Photo, EvidenceKinds.DeliveryNote, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> InspectionKinds = Kinds(
        EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> UsageKinds = Kinds(
        EvidenceKinds.Photo, EvidenceKinds.Receipt, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> InvoiceKinds = Kinds(
        EvidenceKinds.Invoice, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> PaymentKinds = Kinds(
        EvidenceKinds.PaymentProof, EvidenceKinds.Receipt, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> AccountabilityKinds = Kinds(
        EvidenceKinds.Receipt, EvidenceKinds.Photo, EvidenceKinds.Other);
    private static readonly IReadOnlySet<string> OpeningKinds = Kinds(
        EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Receipt, EvidenceKinds.Other);

    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _roles;
    private readonly IEvidenceStorage _storage;

    public EvidenceService(
        AppDbContext db,
        IActorRoleResolver roles,
        IEvidenceStorage storage)
    {
        _db = db;
        _roles = roles;
        _storage = storage;
    }

    public async Task<EvidenceDocumentResponseDto> UploadAsync(
        EvidenceUploadCommand command,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);
        var actor = await RequireActorAsync(actorUserId, actorRole, cancellationToken);
        var sourceType = CanonicalValue(
            command.SourceType,
            EvidenceSourceTypes.All,
            "Evidence source type is not supported.");
        if (command.SourceId <= 0) throw new ArgumentOutOfRangeException(nameof(command.SourceId));
        var source = await ResolveSourceAsync(sourceType, command.SourceId, cancellationToken);
        var evidenceKind = CanonicalValue(
            command.EvidenceKind,
            source.AllowedKinds,
            "Evidence kind is not valid for this source.");

        if (!string.Equals(actor.EffectiveRole, source.UploadRole, StringComparison.Ordinal)
            || source.OwnerUserId != actorUserId)
            throw new UnauthorizedAccessException(
                "Only the user who recorded this source may attach its evidence.");
        await RequireProjectScopeAsync(actor, source.ProjectId, cancellationToken);

        StoredEvidenceFile? stored = null;
        var databaseCommitted = false;
        try
        {
            stored = await _storage.StoreAsync(
                command.Content,
                command.OriginalFileName,
                command.ClaimedContentType,
                command.DeclaredLength,
                cancellationToken);

            var now = DateTime.UtcNow;
            var document = new EvidenceDocument
            {
                Id = Guid.NewGuid(),
                ProjectId = source.ProjectId,
                StorageKey = stored.StorageKey,
                OriginalFileName = stored.OriginalFileName,
                ContentType = stored.ContentType,
                SizeBytes = stored.SizeBytes,
                Sha256Hash = stored.Sha256Hash,
                UploadedByUserId = actorUserId,
                UploadedAt = now,
                Attachment = new EvidenceAttachment
                {
                    ProjectId = source.ProjectId,
                    SourceType = sourceType,
                    SourceId = command.SourceId,
                    EvidenceKind = evidenceKind,
                    LinkedByUserId = actorUserId,
                    LinkedAt = now
                }
            };

            await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
            _db.Set<EvidenceDocument>().Add(document);
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            databaseCommitted = true;
            return await LoadResponseAsync(document.Id, cancellationToken);
        }
        catch
        {
            if (stored is not null && !databaseCommitted)
                await _storage.DeleteIfExistsAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
    }

    public async Task<IReadOnlyList<EvidenceDocumentResponseDto>> GetForSourceAsync(
        string sourceType,
        long sourceId,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireActorAsync(actorUserId, actorRole, cancellationToken);
        var canonicalSourceType = CanonicalValue(
            sourceType,
            EvidenceSourceTypes.All,
            "Evidence source type is not supported.");
        if (sourceId <= 0) throw new ArgumentOutOfRangeException(nameof(sourceId));
        var source = await ResolveSourceAsync(canonicalSourceType, sourceId, cancellationToken);
        await RequireReadAccessAsync(actor, source, cancellationToken);

        var documents = await ResponseQuery()
            .Where(item => item.Attachment.SourceType == canonicalSourceType
                && item.Attachment.SourceId == sourceId
                && item.ProjectId == source.ProjectId)
            .OrderByDescending(item => item.UploadedAt)
            .ThenByDescending(item => item.Id)
            .ToListAsync(cancellationToken);
        return documents.Select(ToDto).ToList();
    }

    public async Task<EvidenceDownload> OpenDownloadAsync(
        Guid documentId,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        if (documentId == Guid.Empty) throw new ArgumentException("Evidence document ID is required.", nameof(documentId));
        var actor = await RequireActorAsync(actorUserId, actorRole, cancellationToken);
        var document = await _db.Set<EvidenceDocument>()
            .AsNoTracking()
            .Include(item => item.Attachment)
            .SingleOrDefaultAsync(item => item.Id == documentId, cancellationToken)
            ?? throw new KeyNotFoundException("The evidence document was not found.");
        var source = await ResolveSourceAsync(
            document.Attachment.SourceType,
            document.Attachment.SourceId,
            cancellationToken);
        if (source.ProjectId != document.ProjectId
            || document.Attachment.ProjectId != document.ProjectId)
            throw new InvalidOperationException("The evidence project link is inconsistent.");
        await RequireReadAccessAsync(actor, source, cancellationToken);

        var stream = await _storage.OpenReadAsync(document.StorageKey, cancellationToken);
        return new EvidenceDownload(
            stream,
            document.ContentType,
            document.OriginalFileName,
            document.SizeBytes);
    }

    private async Task<EvidenceDocumentResponseDto> LoadResponseAsync(
        Guid documentId,
        CancellationToken cancellationToken) =>
        ToDto(await ResponseQuery().SingleAsync(item => item.Id == documentId, cancellationToken));

    private IQueryable<EvidenceDocument> ResponseQuery() =>
        _db.Set<EvidenceDocument>()
            .AsNoTracking()
            .Include(item => item.Project)
            .Include(item => item.UploadedByUser)
            .Include(item => item.Attachment);

    private static EvidenceDocumentResponseDto ToDto(EvidenceDocument item) => new()
    {
        Id = item.Id,
        ProjectId = item.ProjectId,
        ProjectName = item.Project.Name,
        SourceType = item.Attachment.SourceType,
        SourceId = item.Attachment.SourceId,
        EvidenceKind = item.Attachment.EvidenceKind,
        OriginalFileName = item.OriginalFileName,
        ContentType = item.ContentType,
        SizeBytes = item.SizeBytes,
        Sha256Hash = item.Sha256Hash,
        UploadedByUserId = item.UploadedByUserId,
        UploadedByName = item.UploadedByUser.FullName,
        UploadedAt = item.UploadedAt
    };

    private async Task RequireReadAccessAsync(
        ActorRoleContext actor,
        EvidenceSourceContext source,
        CancellationToken cancellationToken)
    {
        if (!source.ReadRoles.Contains(actor.EffectiveRole))
            throw new UnauthorizedAccessException("Your role cannot view evidence for this record type.");
        if (source.RestrictForemanToOwner
            && actor.EffectiveRole == "Foreman"
            && actor.UserId != source.OwnerUserId)
            throw new UnauthorizedAccessException("Foremen may view evidence only for their own material custody records.");
        await RequireProjectScopeAsync(actor, source.ProjectId, cancellationToken);
    }

    private async Task RequireProjectScopeAsync(
        ActorRoleContext actor,
        int projectId,
        CancellationToken cancellationToken)
    {
        if (actor.CanSwitchRoles || actor.EffectiveRole is "CEO" or "Auditor") return;
        var assigned = await _db.UserProjectAssignments.AsNoTracking().AnyAsync(item =>
            item.UserId == actor.UserId
            && item.ProjectId == projectId
            && item.IsActive
            && item.EndedAt == null,
            cancellationToken);
        if (!assigned) throw new UnauthorizedAccessException("You are not assigned to this evidence's project.");
    }

    private async Task<ActorRoleContext> RequireActorAsync(
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken)
    {
        var actor = await _roles.ResolveAsync(actorUserId, cancellationToken: cancellationToken);
        if (actor is null || !string.Equals(actor.EffectiveRole, actorRole, StringComparison.Ordinal))
            throw new UnauthorizedAccessException("The active role could not be verified.");
        return actor;
    }

    private async Task<EvidenceSourceContext> ResolveSourceAsync(
        string sourceType,
        long sourceId,
        CancellationToken cancellationToken)
    {
        switch (sourceType)
        {
            case EvidenceSourceTypes.ProjectProgressVerification:
            {
                if (sourceId > int.MaxValue) throw SourceNotFound();
                var item = await _db.ProjectProgressVerifications.AsNoTracking()
                    .Where(candidate => candidate.Id == (int)sourceId)
                    .Select(candidate => new { candidate.ProjectId, OwnerId = candidate.VerifiedByUserId })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Engineer", ProjectReaders, ProgressKinds, false);
            }
            case EvidenceSourceTypes.GoodsReceipt:
            {
                var item = await _db.GoodsReceipts.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new { candidate.ProjectId, OwnerId = candidate.ReceivedByUserId })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Storekeeper", ReceiptReaders, ReceiptKinds, false);
            }
            case EvidenceSourceTypes.GoodsReceiptTechnicalAcceptance:
            {
                var item = await _db.GoodsReceiptTechnicalAcceptances.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.GoodsReceipt.ProjectId,
                        OwnerId = candidate.EngineerUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Engineer", TechnicalAcceptanceReaders, InspectionKinds, false);
            }
            case EvidenceSourceTypes.MaterialUsageRecord:
            {
                var item = await _db.MaterialUsageRecords.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.MaterialIssue.ProjectId,
                        OwnerId = candidate.RecordedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Foreman", MaterialUsageReaders, UsageKinds, true);
            }
            case EvidenceSourceTypes.SupplierInvoice:
            {
                var item = await _db.SupplierInvoices.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new { candidate.ProjectId, OwnerId = candidate.CapturedByUserId })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Procurement Officer", InvoiceReaders, InvoiceKinds, false);
            }
            case EvidenceSourceTypes.Payment:
            {
                var item = await _db.Payments.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        ProjectId = candidate.PaymentAuthorization.SupplierInvoice.ProjectId,
                        OwnerId = candidate.PaidByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Finance Officer", PaymentReaders, PaymentKinds, false);
            }
            case EvidenceSourceTypes.PettyCashDisbursement:
            {
                var item = await _db.PettyCashDisbursements.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.PettyCashRequest.ProjectId,
                        OwnerId = candidate.DisbursedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Finance Officer", PettyCashReaders, PaymentKinds, false);
            }
            case EvidenceSourceTypes.PettyCashReconciliation:
            {
                var item = await _db.PettyCashReconciliations.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.PettyCashRequest.ProjectId,
                        OwnerId = candidate.SubmittedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Supervisor", PettyCashReaders, AccountabilityKinds, false);
            }
            case EvidenceSourceTypes.OpeningPositionBatch:
            {
                var item = await _db.OpeningPositionBatches.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.ProjectId,
                        OwnerId = candidate.SubmittedByUserId,
                        candidate.PositionType
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                var role = item.PositionType == OpeningPositionTypes.Inventory
                    ? "Storekeeper"
                    : "Finance Officer";
                return new(item.ProjectId, item.OwnerId, role, OpeningPositionReaders, OpeningKinds, false);
            }
            case EvidenceSourceTypes.MaterialReturn:
            {
                var item = await _db.MaterialReturns.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        ProjectId = candidate.MaterialIssue.ProjectId,
                        OwnerId = candidate.ReturnedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Foreman", CustodyReaders, OpeningKinds, true);
            }
            case EvidenceSourceTypes.MaterialReturnReceipt:
            {
                var item = await _db.MaterialReturns.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId
                        && candidate.Status != MaterialReturnStatuses.AwaitingReceipt
                        && candidate.ReceivedByUserId != null)
                    .Select(candidate => new
                    {
                        ProjectId = candidate.MaterialIssue.ProjectId,
                        OwnerId = candidate.ReceivedByUserId!.Value
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Storekeeper", CustodyReaders, OpeningKinds, false);
            }
            case EvidenceSourceTypes.MaterialIssueDisputeResolution:
            {
                var item = await _db.MaterialIssueDisputeResolutions.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        ProjectId = candidate.MaterialIssue.ProjectId,
                        OwnerId = candidate.ResolvedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Supervisor", CustodyReaders, OpeningKinds, false);
            }
            case EvidenceSourceTypes.MaterialCustodyCloseout:
            {
                var item = await _db.MaterialCustodyCloseouts.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        ProjectId = candidate.MaterialIssue.ProjectId,
                        OwnerId = candidate.SubmittedByUserId
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                return new(item.ProjectId, item.OwnerId, "Foreman", CustodyReaders, OpeningKinds, true);
            }
            case EvidenceSourceTypes.ControlledCorrection:
            {
                var item = await _db.ControlledCorrections.AsNoTracking()
                    .Where(candidate => candidate.Id == sourceId)
                    .Select(candidate => new
                    {
                        candidate.ProjectId,
                        OwnerId = candidate.SubmittedByUserId,
                        candidate.CorrectionType
                    })
                    .SingleOrDefaultAsync(cancellationToken) ?? throw SourceNotFound();
                var role = item.CorrectionType == ControlledCorrectionTypes.Inventory
                    ? "Storekeeper"
                    : "Finance Officer";
                return new(item.ProjectId, item.OwnerId, role, CorrectionReaders, OpeningKinds, false);
            }
            default:
                throw new ArgumentException("Evidence source type is not supported.", nameof(sourceType));
        }
    }

    private static string CanonicalValue(
        string? value,
        IEnumerable<string> allowed,
        string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException(errorMessage);
        var canonical = allowed.FirstOrDefault(item =>
            string.Equals(item, value.Trim(), StringComparison.OrdinalIgnoreCase));
        return canonical ?? throw new ArgumentException(errorMessage);
    }

    private static IReadOnlySet<string> Roles(params string[] roles) =>
        new HashSet<string>(roles, StringComparer.Ordinal);

    private static IReadOnlySet<string> Kinds(params string[] kinds) =>
        new HashSet<string>(kinds, StringComparer.Ordinal);

    private static KeyNotFoundException SourceNotFound() =>
        new("The evidence source record was not found.");

    private sealed record EvidenceSourceContext(
        int ProjectId,
        int OwnerUserId,
        string UploadRole,
        IReadOnlySet<string> ReadRoles,
        IReadOnlySet<string> AllowedKinds,
        bool RestrictForemanToOwner);
}

namespace ConstructionMS.Infrastructure.Services.Suppliers;

using System.Data;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Suppliers;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class SupplierOnboardingService(
    AppDbContext db,
    IActorRoleResolver actorRoleResolver) : ISupplierOnboardingService
{
    private const string NormalizedKraPinProperty = "NormalizedKraPin";
    private static readonly string[] AllowedStatuses =
    [
        SupplierOnboardingStatuses.Pending,
        SupplierOnboardingStatuses.Approved,
        SupplierOnboardingStatuses.Rejected
    ];

    public async Task<SupplierOnboardingResponseDto?> GetByIdAsync(
        int requestId,
        CancellationToken cancellationToken = default)
    {
        InputNormalizer.Positive(requestId, nameof(requestId));
        var request = await RequestQuery(db.SupplierOnboardingRequests.AsNoTracking())
            .SingleOrDefaultAsync(candidate => candidate.Id == requestId, cancellationToken);
        return request is null ? null : ToDto(request);
    }

    public async Task<PaginatedResult<SupplierOnboardingResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        CancellationToken cancellationToken = default)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var normalizedStatus = string.IsNullOrWhiteSpace(status)
            ? null
            : AllowedStatuses.FirstOrDefault(candidate =>
                string.Equals(candidate, status.Trim(), StringComparison.OrdinalIgnoreCase))
                ?? throw new ArgumentException(
                    "Status must be Pending, Approved, or Rejected.",
                    nameof(status));

        var query = RequestQuery(db.SupplierOnboardingRequests.AsNoTracking());
        if (normalizedStatus is not null)
        {
            query = query.Where(request => request.Status == normalizedStatus);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var requests = await query
            .OrderBy(request => request.Status == SupplierOnboardingStatuses.Pending ? 0 : 1)
            .ThenByDescending(request => request.SubmittedAt)
            .ThenByDescending(request => request.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync(cancellationToken);

        return new PaginatedResult<SupplierOnboardingResponseDto>
        {
            Items = requests.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<SupplierOnboardingResponseDto> SubmitAsync(
        CreateSupplierOnboardingRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        await RequireActorRoleAsync(
            actorUserId,
            actorRole,
            cancellationToken,
            "Procurement Officer");

        var name = InputNormalizer.RequiredText(request.Name, nameof(request.Name), 2, 200);
        var contactPerson = InputNormalizer.RequiredText(
            request.ContactPerson,
            nameof(request.ContactPerson),
            2,
            150);
        var phoneNumber = InputNormalizer.RequiredText(
            request.PhoneNumber,
            nameof(request.PhoneNumber),
            7,
            30);
        var email = InputNormalizer.OptionalEmail(request.Email, nameof(request.Email));
        var kraPin = InputNormalizer.RequiredText(
            request.KraPin,
            nameof(request.KraPin),
            5,
            20).ToUpperInvariant();
        var mpesaNumber = InputNormalizer.OptionalText(
            request.MpesaNumber,
            nameof(request.MpesaNumber),
            30);
        var category = InputNormalizer.RequiredText(
            request.Category,
            nameof(request.Category),
            2,
            100);

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        if (await db.Suppliers.AsNoTracking().AnyAsync(
                supplier => EF.Property<string?>(supplier, NormalizedKraPinProperty) == kraPin,
                cancellationToken))
        {
            throw new InvalidOperationException(
                "That KRA PIN already belongs to an approved supplier.");
        }

        if (await db.SupplierOnboardingRequests.AsNoTracking().AnyAsync(
                candidate => candidate.Status == SupplierOnboardingStatuses.Pending
                    && EF.Property<string>(candidate, NormalizedKraPinProperty) == kraPin,
                cancellationToken))
        {
            throw new InvalidOperationException(
                "That KRA PIN already has a supplier application awaiting review.");
        }

        var now = DateTime.UtcNow;
        var onboarding = new SupplierOnboardingRequest
        {
            RequestNumber = $"SUP-ONB-{now:yyyyMMddHHmmss}-{Guid.NewGuid():N}"[..31].ToUpperInvariant(),
            Name = name,
            ContactPerson = contactPerson,
            PhoneNumber = phoneNumber,
            Email = email,
            KraPin = kraPin,
            MpesaNumber = mpesaNumber,
            Category = category,
            Status = SupplierOnboardingStatuses.Pending,
            SubmittedByUserId = actorUserId,
            SubmittedAt = now
        };

        db.SupplierOnboardingRequests.Add(onboarding);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadAsync(onboarding.Id, cancellationToken);
    }

    public async Task<SupplierOnboardingResponseDto> ReviewAsync(
        int requestId,
        ReviewSupplierOnboardingRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        InputNormalizer.Positive(requestId, nameof(requestId));
        await RequireActorRoleAsync(
            actorUserId,
            actorRole,
            cancellationToken,
            "CEO",
            "Finance Officer");
        var notes = InputNormalizer.RequiredText(
            request.Notes,
            nameof(request.Notes),
            3,
            1_000);

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var onboarding = await db.SupplierOnboardingRequests
            .SingleOrDefaultAsync(candidate => candidate.Id == requestId, cancellationToken)
            ?? throw new KeyNotFoundException("The supplier onboarding request was not found.");

        if (onboarding.Status != SupplierOnboardingStatuses.Pending)
        {
            throw new InvalidOperationException(
                "This supplier onboarding request has already received a final decision.");
        }

        if (onboarding.SubmittedByUserId == actorUserId)
        {
            throw new UnauthorizedAccessException(
                "The person who submitted a supplier cannot approve or reject that supplier.");
        }

        Supplier? supplier = null;
        if (request.Approve)
        {
            if (await db.Suppliers.AnyAsync(
                    candidate => EF.Property<string?>(candidate, NormalizedKraPinProperty)
                        == onboarding.KraPin,
                    cancellationToken))
            {
                throw new InvalidOperationException(
                    "That KRA PIN already belongs to an approved supplier.");
            }

            supplier = new Supplier
            {
                Name = onboarding.Name,
                ContactPerson = onboarding.ContactPerson,
                PhoneNumber = onboarding.PhoneNumber,
                Email = onboarding.Email,
                KraPin = onboarding.KraPin,
                MpesaNumber = onboarding.MpesaNumber,
                Category = onboarding.Category,
                IsBlacklisted = false,
                CreatedAt = DateTime.UtcNow
            };
            db.Suppliers.Add(supplier);
        }

        onboarding.Status = request.Approve
            ? SupplierOnboardingStatuses.Approved
            : SupplierOnboardingStatuses.Rejected;
        onboarding.ReviewedByUserId = actorUserId;
        onboarding.ReviewedAt = DateTime.UtcNow;
        onboarding.ReviewNotes = notes;
        onboarding.ApprovedSupplier = supplier;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadAsync(onboarding.Id, cancellationToken);
    }

    private async Task RequireActorRoleAsync(
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken,
        params string[] allowedRoles)
    {
        if (!allowedRoles.Any(role => string.Equals(role, actorRole, StringComparison.Ordinal)))
        {
            throw new UnauthorizedAccessException(
                "Your role cannot perform this supplier onboarding action.");
        }

        var actor = await actorRoleResolver.ResolveAsync(
            actorUserId,
            actorRole,
            cancellationToken);
        if (actor is null)
        {
            throw new UnauthorizedAccessException(
                "The authenticated user is inactive or their role context is no longer valid.");
        }
    }

    private async Task<SupplierOnboardingResponseDto> LoadAsync(
        int id,
        CancellationToken cancellationToken)
    {
        var request = await RequestQuery(db.SupplierOnboardingRequests.AsNoTracking())
            .SingleAsync(candidate => candidate.Id == id, cancellationToken);
        return ToDto(request);
    }

    private static IQueryable<SupplierOnboardingRequest> RequestQuery(
        IQueryable<SupplierOnboardingRequest> query) => query
        .Include(request => request.SubmittedByUser)
        .Include(request => request.ReviewedByUser);

    private static SupplierOnboardingResponseDto ToDto(SupplierOnboardingRequest request) => new()
    {
        Id = request.Id,
        RequestNumber = request.RequestNumber,
        Name = request.Name,
        ContactPerson = request.ContactPerson,
        PhoneNumber = request.PhoneNumber,
        Email = request.Email,
        KraPin = request.KraPin,
        MpesaNumber = request.MpesaNumber,
        Category = request.Category,
        Status = request.Status,
        SubmittedByUserId = request.SubmittedByUserId,
        SubmittedByName = request.SubmittedByUser.FullName,
        SubmittedAt = request.SubmittedAt,
        ReviewedByUserId = request.ReviewedByUserId,
        ReviewedByName = request.ReviewedByUser?.FullName,
        ReviewedAt = request.ReviewedAt,
        ReviewNotes = request.ReviewNotes,
        ApprovedSupplierId = request.ApprovedSupplierId
    };
}

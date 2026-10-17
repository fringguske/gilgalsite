namespace ConstructionMS.Infrastructure.Services;

using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

internal sealed class ControlEventWriter(AppDbContext db)
{
    public async Task<ControlEvent> AppendAsync(
        string chainKey,
        int? requisitionId,
        int projectId,
        string entityType,
        long entityId,
        string referenceNumber,
        string eventType,
        int actorUserId,
        string actorRole,
        object? details,
        DateTime occurredAt,
        CancellationToken cancellationToken = default)
    {
        var previous = await db.ControlEvents
            .AsNoTracking()
            .Where(item => item.ChainKey == chainKey)
            .OrderByDescending(item => item.SequenceNumber)
            .Select(item => new { item.SequenceNumber, item.EventHash })
            .FirstOrDefaultAsync(cancellationToken);
        var sequence = (previous?.SequenceNumber ?? 0) + 1;
        var detailsJson = details is null ? null : JsonSerializer.Serialize(details);
        var canonical = string.Join('\u001f',
            chainKey,
            sequence.ToString(CultureInfo.InvariantCulture),
            requisitionId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            projectId.ToString(CultureInfo.InvariantCulture),
            entityType,
            entityId.ToString(CultureInfo.InvariantCulture),
            referenceNumber,
            eventType,
            actorUserId.ToString(CultureInfo.InvariantCulture),
            actorRole,
            occurredAt.ToString("O", CultureInfo.InvariantCulture),
            detailsJson ?? string.Empty,
            previous?.EventHash ?? string.Empty);

        var item = new ControlEvent
        {
            ChainKey = chainKey,
            SequenceNumber = sequence,
            RequisitionId = requisitionId,
            ProjectId = projectId,
            EntityType = entityType,
            EntityId = entityId,
            ReferenceNumber = referenceNumber,
            EventType = eventType,
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            DetailsJson = detailsJson,
            OccurredAt = occurredAt,
            PreviousEventHash = previous?.EventHash,
            EventHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)))
        };
        db.ControlEvents.Add(item);
        return item;
    }
}

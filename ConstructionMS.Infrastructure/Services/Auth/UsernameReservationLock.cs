namespace ConstructionMS.Infrastructure.Services.Auth;

using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

internal static class UsernameReservationLock
{
    private const long LockNamespace = 2_026_080_9;

    public static Task AcquireAsync(
        AppDbContext db,
        string normalizedUsername,
        CancellationToken cancellationToken = default) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({normalizedUsername}, {LockNamespace}))",
            cancellationToken);
}

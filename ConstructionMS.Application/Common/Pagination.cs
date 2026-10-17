namespace ConstructionMS.Application.Common;

/// <summary>Normalizes list pagination before values reach a database query.</summary>
public static class Pagination
{
    public const int DefaultPageSize = 25;
    public const int MaxPageSize = 100;

    public static (int Page, int PageSize, int Offset) Normalize(int page, int pageSize)
    {
        var normalizedPageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var normalizedPage = Math.Max(page, 1);
        var maxSafePage = (int)Math.Min(
            int.MaxValue,
            ((long)int.MaxValue / normalizedPageSize) + 1);
        normalizedPage = Math.Min(normalizedPage, maxSafePage);

        return (
            normalizedPage,
            normalizedPageSize,
            (normalizedPage - 1) * normalizedPageSize);
    }
}

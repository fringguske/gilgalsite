using System.Security.Claims;

namespace ConstructionMS.Api.Common;

public static class ClaimsPrincipalExtensions
{
    public static int GetRequiredUserId(this ClaimsPrincipal principal)
    {
        var rawUserId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(rawUserId, out var userId) || userId <= 0)
        {
            throw new UnauthorizedAccessException("The authenticated user identity is invalid.");
        }

        return userId;
    }

    public static string GetRequiredRole(this ClaimsPrincipal principal)
    {
        var role = principal.FindFirstValue(ClaimTypes.Role);
        if (string.IsNullOrWhiteSpace(role))
        {
            throw new UnauthorizedAccessException("The authenticated role is invalid.");
        }

        return role;
    }
}

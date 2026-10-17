using System.Security.Claims;
using ConstructionMS.Application.Services.Auth;

namespace ConstructionMS.Api.Common;

public sealed class HttpCurrentActorContext(IHttpContextAccessor httpContextAccessor)
    : ICurrentActorContext
{
    public int? UserId
    {
        get
        {
            var raw = httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(raw, out var userId) && userId > 0 ? userId : null;
        }
    }

    public string? EffectiveRole =>
        httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Role);
}

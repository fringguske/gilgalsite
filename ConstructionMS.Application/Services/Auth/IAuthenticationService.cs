namespace ConstructionMS.Application.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;

public interface IAuthenticationService
{
    Task<CurrentUserDto?> AuthenticateAsync(LoginRequestDto request);
    Task<CurrentUserDto?> GetCurrentUserAsync(int userId, string? effectiveRole = null);
}

using System.Security.Claims;
using ConstructionMS.Api.Common;
using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Security;
using ConstructionMS.Application.Services.Auth;
using ApplicationAuthenticationService = ConstructionMS.Application.Services.Auth.IAuthenticationService;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ConstructionMS.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
[Produces("application/json")]
public sealed class AuthController : ControllerBase
{
    private readonly ApplicationAuthenticationService _authenticationService;
    private readonly IAccessRequestService _accessRequestService;
    private readonly ICredentialService _credentialService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        ApplicationAuthenticationService authenticationService,
        IAccessRequestService accessRequestService,
        ICredentialService credentialService,
        ILogger<AuthController> logger)
    {
        _authenticationService = authenticationService;
        _accessRequestService = accessRequestService;
        _credentialService = credentialService;
        _logger = logger;
    }

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("register")]
    public async Task<IActionResult> Register(
        [FromBody] RegisterAccessRequestDto request,
        CancellationToken cancellationToken)
    {
        var accessRequest = await _accessRequestService.RegisterAsync(request, cancellationToken);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<AccessRequestResponseDto>.Ok(accessRequest));
    }

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        var user = await _authenticationService.AuthenticateAsync(request);
        if (user is null)
        {
            return Unauthorized(ApiResponse<CurrentUserDto>.Fail("Invalid username or password."));
        }

        await SignInAsync(user);

        return Ok(ApiResponse<CurrentUserDto>.Ok(user));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await _authenticationService.GetCurrentUserAsync(User.GetRequiredUserId());
        return user is null
            ? Unauthorized(ApiResponse<CurrentUserDto>.Fail("The authenticated user is inactive."))
            : Ok(ApiResponse<CurrentUserDto>.Ok(user));
    }

    /// <summary>
    /// Changes only the current session's workspace role for the explicitly
    /// configured IT verification account. The database role remains unchanged.
    /// </summary>
    [Authorize]
    [HttpPost("role-context")]
    public async Task<IActionResult> SwitchRole([FromBody] SwitchRoleRequestDto request)
    {
        var userId = User.GetRequiredUserId();
        var previousRole = User.GetRequiredRole();
        var user = await _authenticationService.GetCurrentUserAsync(userId, request.Role.Trim());
        if (user is null || !user.CanSwitchRoles)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                ApiResponse<CurrentUserDto>.Fail(
                    "Role switching is not enabled for this account."));
        }

        await SignInAsync(user);
        _logger.LogInformation(
            "IT verification role context changed for user {UserId}: {PreviousRole} -> {EffectiveRole}.",
            userId,
            previousRole,
            user.Role);

        return Ok(ApiResponse<CurrentUserDto>.Ok(user));
    }

    [Authorize]
    [HttpPost("change-username")]
    public async Task<IActionResult> ChangeUsername(
        [FromBody] ChangeUsernameRequestDto request,
        CancellationToken cancellationToken)
    {
        await _credentialService.ChangeUsernameAsync(
            User.GetRequiredUserId(),
            request,
            cancellationToken);
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequestDto request,
        CancellationToken cancellationToken)
    {
        await _credentialService.ChangePasswordAsync(
            User.GetRequiredUserId(),
            request,
            cancellationToken);
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    private Task SignInAsync(CurrentUserDto user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(ApplicationClaimTypes.CredentialVersion, user.CredentialVersion.ToString())
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var properties = new AuthenticationProperties
        {
            AllowRefresh = true,
            IsPersistent = false,
            IssuedUtc = DateTimeOffset.UtcNow,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8)
        };

        return HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            properties);
    }
}

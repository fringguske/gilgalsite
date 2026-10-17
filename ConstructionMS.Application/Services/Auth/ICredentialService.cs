namespace ConstructionMS.Application.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;

public interface ICredentialService
{
    Task ChangeUsernameAsync(
        int userId,
        ChangeUsernameRequestDto request,
        CancellationToken cancellationToken = default);

    Task ChangePasswordAsync(
        int userId,
        ChangePasswordRequestDto request,
        CancellationToken cancellationToken = default);

    Task ResetAdministratorPasswordAsync(
        string username,
        string newPassword,
        CancellationToken cancellationToken = default);
}

namespace ConstructionMS.Application.Services.Users;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Users;

/// <summary>
/// Business operations for Users.
/// Hard deletion is deliberately unsupported so transaction history retains
/// its actor references.
/// </summary>
public interface IUserService
{
    /// <summary>Returns a paginated list of all users with their role names.</summary>
    Task<PaginatedResult<UserResponseDto>> GetAllAsync(int page, int pageSize);

    /// <summary>Returns a single user by ID, or null if not found.</summary>
    Task<UserResponseDto?> GetByIdAsync(int id);

    /// <summary>
    /// Creates a new user. The supplied password is securely hashed before
    /// persistence, and the hash is never returned.
    /// </summary>
    Task<UserResponseDto> CreateAsync(CreateUserRequestDto dto, int? administratorUserId = null);

    /// <summary>Updates user profile fields (not password). Returns null if not found.</summary>
    Task<UserResponseDto?> UpdateAsync(int id, UpdateUserRequestDto dto, int administratorUserId);

    /// <summary>
    /// Sets the user's active state explicitly. Returns false if not found.
    /// </summary>
    Task<bool> SetActiveStatusAsync(int id, bool isActive, int administratorUserId);
}

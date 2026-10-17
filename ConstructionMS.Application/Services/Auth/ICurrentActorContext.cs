namespace ConstructionMS.Application.Services.Auth;

/// <summary>Provides the authenticated identity and effective role from the current request.</summary>
public interface ICurrentActorContext
{
    int? UserId { get; }
    string? EffectiveRole { get; }
}

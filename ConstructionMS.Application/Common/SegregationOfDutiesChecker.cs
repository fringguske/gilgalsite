namespace ConstructionMS.Application.Common;

/// <summary>Pure helpers for actor-level segregation-of-duties checks.</summary>
public static class SegregationOfDutiesChecker
{
    public static bool IsSameUser(int actorAId, int actorBId) =>
        actorAId == actorBId;

    public static string GetViolationMessage(string actorARole, string actorBRole) =>
        $"Segregation of duties violation: the {actorARole} and the {actorBRole} " +
        $"cannot be the same user. Please assign a different user to perform this action.";
}

namespace ConstructionMS.Application.Common;

/// <summary>Transport-neutral outcome for application operations.</summary>
public enum OperationErrorKind
{
    None,
    Validation,
    NotFound,
    Forbidden,
    Conflict
}

public sealed class OperationResult<T>
{
    private OperationResult(T? value, OperationErrorKind errorKind, string? error)
    {
        Value = value;
        ErrorKind = errorKind;
        Error = error;
    }

    public T? Value { get; }
    public OperationErrorKind ErrorKind { get; }
    public string? Error { get; }
    public bool Succeeded => ErrorKind == OperationErrorKind.None;

    public static OperationResult<T> Success(T value) =>
        new(value, OperationErrorKind.None, null);

    public static OperationResult<T> Failure(OperationErrorKind kind, string error)
    {
        if (kind == OperationErrorKind.None)
        {
            throw new ArgumentOutOfRangeException(nameof(kind), "A failure must have an error kind.");
        }

        return new(default, kind, error);
    }
}

namespace ConstructionMS.Infrastructure.Common;

using ConstructionMS.Application.Common;
using System.Text;
using System.Text.RegularExpressions;

internal static class InputNormalizer
{
    private static readonly Regex UsernamePattern = new(
        "^[a-zA-Z0-9][a-zA-Z0-9._-]*$",
        RegexOptions.CultureInvariant);
    private static readonly char[] OuterWhitespace = [' ', '\t', '\n', '\v', '\f', '\r'];

    public static string RequiredText(
        string? value,
        string parameterName,
        int minimumLength = 1,
        int maximumLength = int.MaxValue)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("A non-empty value is required.", parameterName);
        }

        var normalized = value.Trim(OuterWhitespace);
        if (normalized.Length < minimumLength || normalized.Length > maximumLength)
        {
            throw new ArgumentException(
                $"The value must be between {minimumLength} and {maximumLength} characters after trimming.",
                parameterName);
        }

        return normalized;
    }

    public static string? OptionalText(
        string? value,
        string parameterName,
        int maximumLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim(OuterWhitespace);
        if (normalized.Length > maximumLength)
        {
            throw new ArgumentException(
                $"The value cannot exceed {maximumLength} characters after trimming.",
                parameterName);
        }

        return normalized;
    }

    public static string Email(string? value, string parameterName) =>
        RequiredText(value, parameterName, minimumLength: 3, maximumLength: 254).ToLowerInvariant();

    public static string Username(string? value, string parameterName)
    {
        var username = RequiredText(value, parameterName, 3, 50).ToLowerInvariant();
        if (!UsernamePattern.IsMatch(username))
        {
            throw new ArgumentException(
                "Username may contain only letters, numbers, dots, underscores, and hyphens.",
                parameterName);
        }

        return username;
    }

    public static string Password(
        string? value,
        string parameterName,
        int minimumLength,
        int maximumLength,
        int maximumUtf8Bytes)
    {
        if (string.IsNullOrWhiteSpace(value)
            || value.Length < minimumLength
            || value.Length > maximumLength
            || Encoding.UTF8.GetByteCount(value) > maximumUtf8Bytes)
        {
            throw new ArgumentException(
                $"The value must be between {minimumLength} and {maximumLength} characters " +
                $"and no more than {maximumUtf8Bytes} UTF-8 bytes.",
                parameterName);
        }

        return value;
    }

    public static string? OptionalEmail(string? value, string parameterName) =>
        OptionalText(value, parameterName, 254)?.ToLowerInvariant();

    public static string? OptionalUppercase(
        string? value,
        string parameterName,
        int maximumLength) =>
        OptionalText(value, parameterName, maximumLength)?.ToUpperInvariant();

    public static int Positive(int value, string parameterName)
    {
        if (value <= 0)
        {
            throw new ArgumentOutOfRangeException(parameterName, "The value must be greater than zero.");
        }

        return value;
    }

    public static decimal NonNegative(
        decimal value,
        string parameterName,
        int precision,
        int scale)
    {
        if (value < 0)
        {
            throw new ArgumentOutOfRangeException(parameterName, "The value cannot be negative.");
        }

        EnsurePrecision(value, parameterName, precision, scale);
        return value;
    }

    public static decimal Positive(
        decimal value,
        string parameterName,
        int precision,
        int scale)
    {
        if (value <= 0)
        {
            throw new ArgumentOutOfRangeException(parameterName, "The value must be greater than zero.");
        }

        EnsurePrecision(value, parameterName, precision, scale);
        return value;
    }

    private static void EnsurePrecision(
        decimal value,
        string parameterName,
        int precision,
        int scale)
    {
        if (!DecimalPrecision.Fits(value, precision, scale))
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                $"The value must fit within {precision} digits and {scale} decimal places.");
        }
    }
}

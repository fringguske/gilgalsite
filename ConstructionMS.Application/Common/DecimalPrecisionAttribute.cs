namespace ConstructionMS.Application.Common;

using System.ComponentModel.DataAnnotations;

/// <summary>Validates that a decimal fits a database precision and scale without rounding.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class DecimalPrecisionAttribute : ValidationAttribute
{
    public DecimalPrecisionAttribute(int precision, int scale)
    {
        if (precision <= 0 || scale < 0 || scale > precision)
        {
            throw new ArgumentOutOfRangeException(nameof(precision));
        }

        Precision = precision;
        Scale = scale;
    }

    public int Precision { get; }

    public int Scale { get; }

    public override bool IsValid(object? value) =>
        value is null || value is decimal number && DecimalPrecision.Fits(number, Precision, Scale);

    public override string FormatErrorMessage(string name) =>
        $"{name} must fit within {Precision} digits with no more than {Scale} decimal places.";
}

public static class DecimalPrecision
{
    public static bool Fits(decimal value, int precision, int scale)
    {
        var maximumExclusive = PowerOfTen(precision - scale);
        return value > -maximumExclusive
            && value < maximumExclusive
            && value == decimal.Round(value, scale, MidpointRounding.ToZero);
    }

    private static decimal PowerOfTen(int exponent)
    {
        var result = 1m;
        for (var index = 0; index < exponent; index++)
        {
            result *= 10m;
        }

        return result;
    }
}

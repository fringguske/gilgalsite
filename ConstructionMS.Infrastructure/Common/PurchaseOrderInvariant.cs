namespace ConstructionMS.Infrastructure.Common;

using ConstructionMS.Domain.Entities;

internal static class PurchaseOrderInvariant
{
    public static PurchaseOrderLine RequireSingleLine(PurchaseOrder order)
    {
        if (order.Lines.Count != 1)
        {
            throw new InvalidOperationException(
                "The purchase order must contain exactly one line for this workflow.");
        }

        return order.Lines.First();
    }
}

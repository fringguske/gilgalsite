namespace ConstructionMS.Infrastructure.Services.Finance;

using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

internal static class BudgetCommitmentGuard
{
    public static Task LockProjectAsync(AppDbContext db, int projectId) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"Projects\" WHERE \"Id\" = {projectId} FOR UPDATE");

    public static async Task EnsureAvailableAsync(
        AppDbContext db,
        int projectId,
        int costCodeId,
        decimal proposedAmount,
        int? excludedPurchaseOrderId = null,
        long? excludedPettyCashRequestId = null)
    {
        var budget = await db.ProjectBudgets
            .AsNoTracking()
            .Where(item => item.ProjectId == projectId)
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Select(item => new
            {
                item.Id,
                item.ApprovedAmount
            })
            .FirstOrDefaultAsync()
            ?? throw new InvalidOperationException("Set a project budget before approving this commitment.");

        var costCodeAllocation = await db.ProjectBudgetAllocations
            .AsNoTracking()
            .Where(item => item.ProjectBudgetId == budget.Id && item.CostCodeId == costCodeId)
            .Select(item => (decimal?)item.AllocatedAmount)
            .SingleOrDefaultAsync();
        if (!costCodeAllocation.HasValue)
        {
            throw new InvalidOperationException("This budget area has no allocation in the current budget.");
        }

        var purchaseOrders = db.PurchaseOrderLines
            .AsNoTracking()
            .Where(line =>
                line.PurchaseOrder.ProjectId == projectId
                && line.Requisition.CostCodeId == costCodeId
                && (line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Approved
                    || line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Issued));
        if (excludedPurchaseOrderId.HasValue)
        {
            purchaseOrders = purchaseOrders.Where(line =>
                line.PurchaseOrderId != excludedPurchaseOrderId.Value);
        }

        var pettyCash = db.PettyCashRequests
            .AsNoTracking()
            .Where(item =>
                item.ProjectId == projectId
                && item.CostCodeId == costCodeId
                && item.AmountCommitted.HasValue
                && item.Status != PettyCashStatuses.Rejected);
        if (excludedPettyCashRequestId.HasValue)
        {
            pettyCash = pettyCash.Where(item => item.Id != excludedPettyCashRequestId.Value);
        }

        var costCodeCommitted =
            (await purchaseOrders.SumAsync(line => (decimal?)(line.Quantity * line.UnitPrice)) ?? 0m)
            + (await pettyCash.SumAsync(item => item.AmountCommitted) ?? 0m);

        var allPurchaseOrders = db.PurchaseOrderLines
            .AsNoTracking()
            .Where(line =>
                line.PurchaseOrder.ProjectId == projectId
                && (line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Approved
                    || line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Issued));
        if (excludedPurchaseOrderId.HasValue)
        {
            allPurchaseOrders = allPurchaseOrders.Where(line =>
                line.PurchaseOrderId != excludedPurchaseOrderId.Value);
        }

        var allPettyCash = db.PettyCashRequests
            .AsNoTracking()
            .Where(item =>
                item.ProjectId == projectId
                && item.AmountCommitted.HasValue
                && item.Status != PettyCashStatuses.Rejected);
        if (excludedPettyCashRequestId.HasValue)
        {
            allPettyCash = allPettyCash.Where(item =>
                item.Id != excludedPettyCashRequestId.Value);
        }

        var projectCommitted =
            (await allPurchaseOrders.SumAsync(line => (decimal?)(line.Quantity * line.UnitPrice)) ?? 0m)
            + (await allPettyCash.SumAsync(item => item.AmountCommitted) ?? 0m);

        var projectAvailable = budget.ApprovedAmount - projectCommitted;
        if (proposedAmount > projectAvailable)
        {
            throw new InvalidOperationException(
                $"Project budget available: KES {Math.Max(projectAvailable, 0m):N2}.");
        }

        var costCodeAvailable = costCodeAllocation.Value - costCodeCommitted;
        if (proposedAmount > costCodeAvailable)
        {
            throw new InvalidOperationException(
                $"Budget-area amount available: KES {Math.Max(costCodeAvailable, 0m):N2}.");
        }
    }

    public static async Task EnsureRevisionCoversCommitmentsAsync(
        AppDbContext db,
        int projectId,
        decimal approvedAmount,
        IReadOnlyDictionary<int, decimal> allocations)
    {
        var purchaseCommitments = await db.PurchaseOrderLines
            .AsNoTracking()
            .Where(line =>
                line.PurchaseOrder.ProjectId == projectId
                && (line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Approved
                    || line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Issued))
            .GroupBy(line => line.Requisition.CostCodeId)
            .Select(group => new
            {
                CostCodeId = group.Key,
                Amount = group.Sum(line => line.Quantity * line.UnitPrice)
            })
            .ToListAsync();
        var pettyCashCommitments = await db.PettyCashRequests
            .AsNoTracking()
            .Where(item =>
                item.ProjectId == projectId
                && item.AmountCommitted.HasValue
                && item.Status != PettyCashStatuses.Rejected)
            .GroupBy(item => item.CostCodeId)
            .Select(group => new
            {
                CostCodeId = group.Key,
                Amount = group.Sum(item => item.AmountCommitted ?? 0m)
            })
            .ToListAsync();

        var committedByCostCode = purchaseCommitments
            .Concat(pettyCashCommitments)
            .GroupBy(item => item.CostCodeId)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Amount));
        var totalCommitted = committedByCostCode.Values.Sum();
        if (totalCommitted > approvedAmount)
        {
            throw new InvalidOperationException(
                $"Current commitments are KES {totalCommitted:N2}. The project budget cannot be lower.");
        }

        foreach (var commitment in committedByCostCode)
        {
            var allocated = allocations.GetValueOrDefault(commitment.Key);
            if (commitment.Value > allocated)
            {
                throw new InvalidOperationException(
                    $"A budget area already has KES {commitment.Value:N2} committed. Its allocation cannot be lower.");
            }
        }
    }
}

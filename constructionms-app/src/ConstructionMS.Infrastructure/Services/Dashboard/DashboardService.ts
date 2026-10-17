import { sql, type SQL } from 'drizzle-orm'
import { UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { DashboardResponseDto } from '@/ConstructionMS.Application/DTOs/Dashboard/DashboardResponseDto'
import type { IAuthenticationService } from '@/ConstructionMS.Application/Services/Auth/IAuthenticationService'
import type { IDashboardService } from '@/ConstructionMS.Application/Services/Dashboard/IDashboardService'
import { InvoiceStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import {
  MaterialIssueStatuses, StockCountStatuses, TechnicalAcceptanceOutcomes,
} from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionTypes } from '@/ConstructionMS.Domain/Entities/Requisition'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { SupplierOnboardingStatuses } from '@/ConstructionMS.Domain/Entities/SupplierOnboardingRequest'
import type { AppDbContext } from '../../Data/AppDbContext'

export class DashboardService implements IDashboardService {
  constructor(
    private readonly db: AppDbContext,
    private readonly authenticationService: IAuthenticationService,
  ) {}

  async getAsync(userId: number): Promise<DashboardResponseDto> {
    const user = await this.authenticationService.getCurrentUserAsync(userId)
    if (user === null) {
      throw new UnauthorizedAccessError('The authenticated user is inactive or no longer exists.')
    }

    const visibleProjectIds = user.projects.map(project => project.id)
    // `visibleProjectIds.Contains(x)`: an empty list matches nothing.
    const visible = (column: SQL): SQL => visibleProjectIds.length === 0
      ? sql`false`
      : sql`${column} in (${sql.join(visibleProjectIds.map(id => sql`${id}`), sql`, `)})`
    const count = async (query: SQL): Promise<number> => {
      const [row] = await this.db.execute<{ value: number }>(query)
      return Number(row?.value ?? 0)
    }
    const list = (values: readonly string[]): SQL => sql.join(values.map(value => sql`${value}`), sql`, `)

    const activeInvoiceStatuses = [
      InvoiceStatuses.PendingReview,
      InvoiceStatuses.Matched,
      InvoiceStatuses.AwaitingCeoApproval,
      InvoiceStatuses.ReadyForAuthorization,
      InvoiceStatuses.Authorized,
      InvoiceStatuses.Paid,
    ]

    const pendingGoodsReceiptCount = await count(sql`
      select count(*)::int as value from "PurchaseOrders" o
      where ${visible(sql`o."ProjectId"`)} and o."Status" = ${PurchaseOrderWorkflowStates.Issued}
        and exists (
          select 1 from "PurchaseOrderLines" l
          where l."PurchaseOrderId" = o."Id"
            and coalesce((
              select sum(r."AcceptedQuantity") from "GoodsReceipts" r
              where r."PurchaseOrderLineId" = l."Id"
                and (not l."RequiresTechnicalAcceptance"
                  or not exists (select 1 from "GoodsReceiptTechnicalAcceptances" t where t."GoodsReceiptId" = r."Id")
                  or (select t."Outcome" from "GoodsReceiptTechnicalAcceptances" t
                      where t."GoodsReceiptId" = r."Id" order by t."ReviewSequence" desc limit 1)
                     is distinct from ${TechnicalAcceptanceOutcomes.Rejected})
            ), 0) < l."Quantity")`)

    const pendingInvoiceCaptureCount = await count(sql`
      select count(*)::int as value from "PurchaseOrders" o
      where ${visible(sql`o."ProjectId"`)} and o."Status" = ${PurchaseOrderWorkflowStates.Issued}
        and exists (
          select 1 from "PurchaseOrderLines" l
          where l."PurchaseOrderId" = o."Id"
            and coalesce((
              select sum(r."AcceptedQuantity") from "GoodsReceipts" r
              where r."PurchaseOrderLineId" = l."Id"
                and (select t."Outcome" from "GoodsReceiptTechnicalAcceptances" t
                     where t."GoodsReceiptId" = r."Id" order by t."ReviewSequence" desc limit 1)
                    is distinct from ${TechnicalAcceptanceOutcomes.Rejected}
            ), 0) = l."Quantity")
        and not exists (
          select 1 from "SupplierInvoices" i
          where i."PurchaseOrderId" = o."Id" and i."Status" in (${list(activeInvoiceStatuses)}))`)

    return {
      user,
      visibleProjectCount: visibleProjectIds.length,
      pendingRequisitionCount: await count(sql`
        select count(*)::int as value from "Requisitions" q
        where ${visible(sql`q."ProjectId"`)}
          and q."Status" in ('Pending', 'AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', 'ReturnedForRevision')`),
      approvedRequisitionCount: await count(sql`
        select count(*)::int as value from "Requisitions" q
        where ${visible(sql`q."ProjectId"`)} and q."Status" = ${RequisitionWorkflowStates.Approved}`),
      pendingAccessRequestCount: user.role === 'Administrator'
        ? await count(sql`select count(*)::int as value from "AccessRequests" where "Status" = 'Pending'`)
        : 0,
      pendingSupplierOnboardingCount: await count(sql`
        select count(*)::int as value from "SupplierOnboardingRequests"
        where "Status" = ${SupplierOnboardingStatuses.Pending}`),
      pendingGoodsReceiptCount,
      pendingMaterialIssueCount: await count(sql`
        select count(*)::int as value from "Requisitions" q
        where ${visible(sql`q."ProjectId"`)}
          and q."Status" = ${RequisitionWorkflowStates.Approved}
          and q."RequestType" = ${RequisitionTypes.SiteUse}
          and not exists (select 1 from "MaterialIssues" mi where mi."RequisitionId" = q."Id")`),
      pendingMaterialConfirmationCount: await count(sql`
        select count(*)::int as value from "MaterialIssues" mi
        where ${visible(sql`mi."ProjectId"`)} and mi."IssuedToUserId" = ${userId}
          and mi."Status" = ${MaterialIssueStatuses.AwaitingConfirmation}`),
      pendingStockCountReviewCount: await count(sql`
        select count(*)::int as value from "StockCounts" sc
        where ${visible(sql`sc."ProjectId"`)} and sc."Status" = ${StockCountStatuses.AwaitingReview}`),
      pendingInvoiceCaptureCount,
      pendingInvoiceReviewCount: await count(sql`
        select count(*)::int as value from "SupplierInvoices" i
        where ${visible(sql`i."ProjectId"`)} and i."Status" = ${InvoiceStatuses.PendingReview}`),
      pendingCeoDecisionCount: await count(sql`
        select count(*)::int as value from "SupplierInvoices" i
        where ${visible(sql`i."ProjectId"`)} and i."Status" = ${InvoiceStatuses.AwaitingCeoApproval}`),
      pendingPaymentAuthorizationCount: await count(sql`
        select count(*)::int as value from "SupplierInvoices" i
        where ${visible(sql`i."ProjectId"`)} and i."Status" = ${InvoiceStatuses.ReadyForAuthorization}`),
      pendingPaymentCount: await count(sql`
        select count(*)::int as value from "PaymentAuthorizations" a
        join "SupplierInvoices" i on i."Id" = a."SupplierInvoiceId"
        where ${visible(sql`i."ProjectId"`)}
          and not exists (select 1 from "Payments" p where p."PaymentAuthorizationId" = a."Id")`),
      completedPaymentCount: await count(sql`
        select count(*)::int as value from "Payments" p
        join "PaymentAuthorizations" a on a."Id" = p."PaymentAuthorizationId"
        join "SupplierInvoices" i on i."Id" = a."SupplierInvoiceId"
        where ${visible(sql`i."ProjectId"`)}`),
    }
  }
}

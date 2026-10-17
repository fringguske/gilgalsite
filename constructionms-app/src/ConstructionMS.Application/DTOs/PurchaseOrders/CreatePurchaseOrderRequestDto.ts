import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/**
 * Creates a draft PO. Material, quantity and unit price are derived on the server from
 * the approved requisition and selected supplier quote.
 */
export const CreatePurchaseOrderRequestDto = dto({
  requisitionId: f.int().range(1, INT_MAX),
  supplierQuoteId: f.int().range(1, INT_MAX),
  expectedDeliveryDate: f.dateOnly().nullable().required(),
  deliveryLocation: f.string().nullable().stringLength(300),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreatePurchaseOrderRequestDto = InferDto<typeof CreatePurchaseOrderRequestDto>

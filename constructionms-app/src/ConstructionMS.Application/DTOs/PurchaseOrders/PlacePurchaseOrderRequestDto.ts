import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/**
 * Records an order already agreed with a supplier outside the system: who supplies the approved
 * request, at what unit price, and when it should arrive. The quantity is the approved quantity.
 */
export const PlacePurchaseOrderRequestDto = dto({
  requisitionId: f.int().range(1, INT_MAX),
  supplierId: f.int().range(1, INT_MAX),
  unitPrice: f.decimal().range('0.01', '9999999999999999.99').decimalPrecision(18, 2),
  expectedDeliveryDate: f.dateOnly().nullable().required(),
  deliveryLocation: f.string().nullable().stringLength(300),
  /** The supplier's own quotation, proforma or order number, if there is one. */
  supplierReference: f.string().nullable().stringLength(100),
  notes: f.string().nullable().stringLength(1_000),
})
export type PlacePurchaseOrderRequestDto = InferDto<typeof PlacePurchaseOrderRequestDto>

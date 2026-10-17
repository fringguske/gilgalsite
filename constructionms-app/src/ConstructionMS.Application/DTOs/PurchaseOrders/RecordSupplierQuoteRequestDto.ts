import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

export const RecordSupplierQuoteRequestDto = dto({
  supplierId: f.int().range(1, INT_MAX),
  quoteReference: f.string().required().stringLength(100),
  quantityOffered: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  unitPrice: f.decimal().range('0.01', '9999999999999999.99').decimalPrecision(18, 2),
  validUntil: f.dateOnly().nullable(),
  notes: f.string().nullable().stringLength(1_000),
})
export type RecordSupplierQuoteRequestDto = InferDto<typeof RecordSupplierQuoteRequestDto>

import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** Creates a controlled bulk purchase request for a project store. The store does not have to say why. */
export const CreateStockReplenishmentRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  materialId: f.int().range(1, INT_MAX),
  costCodeId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  neededByDate: f.dateOnly(),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreateStockReplenishmentRequestDto = InferDto<typeof CreateStockReplenishmentRequestDto>

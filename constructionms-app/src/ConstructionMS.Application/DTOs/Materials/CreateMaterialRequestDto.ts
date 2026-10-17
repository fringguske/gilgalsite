import { dto, f, type InferDto } from '../../Common/Validation'

/** Request body for POST /api/materials. */
export const CreateMaterialRequestDto = dto({
  /** Material name, e.g. "Portland Cement 50kg". Required. */
  name: f.string().required().stringLength(150, 2),
  /** Optional grouping category, e.g. "Structural" or "Electrical". */
  category: f.string().nullable().stringLength(100),
  /** Unit of measurement, e.g. "bags", "litres", "m³". Required. */
  unit: f.string().required().stringLength(30),
  /** Standard/reference price per unit in KES. */
  standardPrice: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
  /** Quantity below which a reorder alert should be raised. */
  reorderLevel: f.decimal().range('0', '999999999999999.999').decimalPrecision(18, 3),
})
export type CreateMaterialRequestDto = InferDto<typeof CreateMaterialRequestDto>

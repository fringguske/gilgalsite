import { dto, f, type InferDto } from '../../Common/Validation'

/** Request body for PUT /api/materials/{id}. */
export const UpdateMaterialRequestDto = dto({
  name: f.string().required().stringLength(150, 2),
  category: f.string().nullable().stringLength(100),
  unit: f.string().required().stringLength(30),
  standardPrice: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
  reorderLevel: f.decimal().range('0', '999999999999999.999').decimalPrecision(18, 3),
})
export type UpdateMaterialRequestDto = InferDto<typeof UpdateMaterialRequestDto>

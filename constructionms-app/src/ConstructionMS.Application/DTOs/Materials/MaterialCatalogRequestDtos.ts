import { dto, f, type InferDto } from '../../Common/Validation'
import { INT_MAX } from '../../Common/Pagination'

export const CreateMaterialCatalogRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  name: f.string().required().stringLength(150, 2),
  category: f.string().nullable().stringLength(100),
  unit: f.string().required().stringLength(30, 1),
  purpose: f.string().required().stringLength(500, 3),
})
export type CreateMaterialCatalogRequestDto = InferDto<typeof CreateMaterialCatalogRequestDto>

export const ReviewMaterialCatalogRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type ReviewMaterialCatalogRequestDto = InferDto<typeof ReviewMaterialCatalogRequestDto>

export interface MaterialCatalogRequestResponseDto {
  id: number
  requestNumber: string
  projectId: number
  projectName: string
  name: string
  category: string | null
  unit: string
  purpose: string
  status: string
  submittedByUserId: number
  submittedByName: string
  submittedAt: Date
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  approvedMaterialId: number | null
}

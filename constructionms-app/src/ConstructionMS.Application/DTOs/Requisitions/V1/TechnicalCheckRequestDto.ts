import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** An engineer's technical assessment. Allowed outcomes: Verified, RevisionRequired. */
export const TechnicalCheckRequestDto = dto({
  outcome: f.string().required().regex('^(Verified|RevisionRequired)$'),
  comments: f.string().nullable().stringLength(1_000),
  expectedRevision: f.int().range(1, INT_MAX),
})
export type TechnicalCheckRequestDto = InferDto<typeof TechnicalCheckRequestDto>

import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** A supervisor's decision. Allowed values: Approve, Reject, ReturnForRevision. */
export const SupervisorDecisionRequestDto = dto({
  decision: f.string().required().regex('^(Approve|Reject|ReturnForRevision)$'),
  comments: f.string().nullable().stringLength(1_000),
  expectedRevision: f.int().range(1, INT_MAX),
})
export type SupervisorDecisionRequestDto = InferDto<typeof SupervisorDecisionRequestDto>

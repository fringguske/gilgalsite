import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** Temporary actor input for requisition approval and rejection. */
export const ApproveRejectRequestDto = dto({
  /** ID of the acting user; must differ from the requester. */
  approvedByUserId: f.int().range(1, INT_MAX),
})
export type ApproveRejectRequestDto = InferDto<typeof ApproveRejectRequestDto>

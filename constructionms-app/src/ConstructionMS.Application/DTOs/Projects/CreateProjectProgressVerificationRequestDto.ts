import { dto, f, type InferDto } from '../../Common/Validation'

export const CreateProjectProgressVerificationRequestDto = dto({
  percentageComplete: f.decimal().range('0', '100').decimalPrecision(5, 2),
  workSummary: f.string().required().stringLength(2_000, 5),
  /** A document, photo-set or inspection reference; never raw file data. */
  evidenceReference: f.string().nullable().stringLength(500),
})
export type CreateProjectProgressVerificationRequestDto = InferDto<typeof CreateProjectProgressVerificationRequestDto>

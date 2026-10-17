import type { ValidationErrors } from '@/ConstructionMS.Application/Common/Validation'

/** ASP.NET Core ValidationProblemDetails body returned by [ApiController] model validation. */
export function validationProblemDetails(errors: ValidationErrors, traceId: string) {
  return {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors,
    traceId,
  }
}

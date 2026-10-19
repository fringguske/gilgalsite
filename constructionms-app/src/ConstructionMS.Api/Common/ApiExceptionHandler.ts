import {
  ArgumentError, DbUpdateConcurrencyError, InvalidOperationError, KeyNotFoundError, ServiceUnavailableError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { ModelValidationError } from '@/ConstructionMS.Application/Common/Validation'
import { createLogger } from '@/ConstructionMS.Application/Common/Logger'
import { isDbUpdateError, isRetryableDatabaseConflict } from '@/ConstructionMS.Infrastructure/Common/DatabaseErrors'
import { ApiResponse } from './ApiResponse'
import { validationProblemDetails } from './ProblemDetails'
import type { ActionResult } from './ControllerBase'
import type { HttpContext } from './HttpContext'

const logger = createLogger('ApiExceptionHandler')

/** Maps thrown exceptions to the same status codes and ApiResponse bodies as the C# IExceptionHandler. */
export function handleException(context: HttpContext, exception: unknown): ActionResult {
  if (exception instanceof ModelValidationError) {
    return { kind: 'json', status: 400, body: validationProblemDetails(exception.errors, context.traceIdentifier) }
  }

  const retryable = isRetryableDatabaseConflict(exception)
  let status: number
  let message: string
  if (exception instanceof KeyNotFoundError) {
    status = 404
    message = exception.message
  } else if (exception instanceof UnauthorizedAccessError) {
    status = 403
    message = exception.message
  } else if (exception instanceof ArgumentError) {
    status = 400
    message = exception.message
  } else if (exception instanceof DbUpdateConcurrencyError) {
    status = 409
    message = 'This record changed after it was opened. Refresh and try again.'
  } else if (retryable) {
    status = 409
    message = 'Another update happened at the same time. Try again.'
  } else if (isDbUpdateError(exception)) {
    status = 409
    message = 'The change conflicts with an existing or protected database record.'
  } else if (exception instanceof InvalidOperationError) {
    status = 409
    message = exception.message
  } else if (exception instanceof ServiceUnavailableError) {
    status = 503
    message = exception.message
  } else {
    status = 500
    message = 'An unexpected server error occurred.'
  }

  if (status >= 500) logger.error('Unhandled API exception', { path: context.url.pathname }, exception)
  else logger.warning('Rejected API request', { path: context.url.pathname, status }, exception)

  return {
    kind: 'json',
    status,
    body: ApiResponse.fail(message),
    headers: retryable ? { 'Retry-After': '1' } : undefined,
  }
}

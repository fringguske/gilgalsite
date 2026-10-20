/**
 * TypeScript equivalents of the .NET exceptions the services throw. The API
 * exception handler maps them to the same HTTP status codes as before:
 *   KeyNotFoundError -> 404, UnauthorizedAccessError -> 403, ArgumentError -> 400,
 *   DbUpdateConcurrencyError / InvalidOperationError -> 409, ServiceUnavailableError -> 503,
 *   anything else -> 500.
 */
export class ArgumentError extends Error {
  constructor(message: string, readonly paramName?: string) {
    super(paramName ? `${message} (Parameter '${paramName}')` : message)
    this.name = 'ArgumentError'
  }
}

/** ArgumentOutOfRangeException derives from ArgumentException in .NET and maps to 400 too. */
export class ArgumentOutOfRangeError extends ArgumentError {
  constructor(paramName: string, message: string) {
    super(message, paramName)
    this.name = 'ArgumentOutOfRangeError'
  }
}

export class KeyNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KeyNotFoundError'
  }
}

export class UnauthorizedAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedAccessError'
  }
}

export class InvalidOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOperationError'
  }
}

/** Raised when an optimistic-concurrency check (e.g. a WorkflowRevision guard) matched no row. */
export class DbUpdateConcurrencyError extends Error {
  constructor(message = 'The database operation was expected to affect 1 row(s), but actually affected 0 row(s).') {
    super(message)
    this.name = 'DbUpdateConcurrencyError'
  }
}

/** An external dependency (such as the email provider) could not complete the request. */
export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceUnavailableError'
  }
}

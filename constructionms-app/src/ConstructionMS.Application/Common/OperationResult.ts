/** Transport-neutral outcome for application operations. */
export enum OperationErrorKind {
  None = 'None',
  Validation = 'Validation',
  NotFound = 'NotFound',
  Forbidden = 'Forbidden',
  Conflict = 'Conflict',
}

export class OperationResult<T> {
  private constructor(
    readonly value: T | undefined,
    readonly errorKind: OperationErrorKind,
    readonly error: string | null,
  ) {}

  get succeeded(): boolean {
    return this.errorKind === OperationErrorKind.None
  }

  static success<T>(value: T): OperationResult<T> {
    return new OperationResult<T>(value, OperationErrorKind.None, null)
  }

  static failure<T>(kind: OperationErrorKind, error: string): OperationResult<T> {
    if (kind === OperationErrorKind.None) {
      throw new RangeError('A failure must have an error kind.')
    }

    return new OperationResult<T>(undefined, kind, error)
  }
}

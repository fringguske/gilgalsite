/** Minimal replacement for Microsoft.Extensions.Logging.ILogger<T>; writes structured lines to stdout/stderr (Vercel logs). */
export interface ILogger {
  information(message: string, properties?: Record<string, unknown>): void
  warning(message: string, properties?: Record<string, unknown>, error?: unknown): void
  error(message: string, properties?: Record<string, unknown>, error?: unknown): void
}

export function createLogger(category: string): ILogger {
  const write = (level: string, message: string, properties?: Record<string, unknown>, error?: unknown) => {
    const line = JSON.stringify({
      level,
      category,
      message,
      ...properties,
      ...(error instanceof Error ? { exception: `${error.name}: ${error.message}` } : {}),
    })
    if (level === 'error') console.error(line)
    else if (level === 'warning') console.warn(line)
    else console.log(line)
  }

  return {
    information: (message, properties) => write('information', message, properties),
    warning: (message, properties, error) => write('warning', message, properties, error),
    error: (message, properties, error) => write('error', message, properties, error),
  }
}

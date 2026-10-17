function requireLiveMode(value: string | undefined): void {
  const normalized = value?.trim().toLowerCase()

  if (!normalized || normalized === 'live') {
    return
  }

  throw new Error(`Unsupported VITE_API_MODE "${value}". This application runs in live mode only.`)
}

function resolveApiBaseUrl(value: string | undefined): string {
  const configuredValue = value?.trim() || '/api/v1'
  return configuredValue.endsWith('/')
    ? configuredValue.slice(0, -1)
    : configuredValue
}

export const apiConfig = Object.freeze({
  baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
})

requireLiveMode(import.meta.env.VITE_API_MODE)

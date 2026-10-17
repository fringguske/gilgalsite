import { randomUUID } from 'node:crypto'
import type { ClaimsPrincipal } from './ClaimsPrincipalExtensions'
import type { ServiceScope } from '../Program'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface CookieWrite {
  name: string
  value: string
  /** Seconds; 0 deletes the cookie. Undefined = browser-session cookie. */
  maxAge?: number
}

/** Per-request state shared by the pipeline, the authentication handler and the controller. */
export class HttpContext {
  readonly traceIdentifier = randomUUID()
  readonly url: URL
  readonly method: string
  readonly responseHeaders = new Headers()
  readonly responseCookies: CookieWrite[] = []
  routeValues: Record<string, string> = {}
  user: ClaimsPrincipal | null = null
  services!: ServiceScope
  private bodyText: Promise<string> | null = null
  private formData: Promise<FormData> | null = null

  constructor(readonly request: Request) {
    this.url = new URL(request.url)
    this.method = request.method.toUpperCase()
  }

  get query(): URLSearchParams {
    return this.url.searchParams
  }

  /** Client IP behind the Vercel / reverse proxy (ForwardLimit = 1 → first hop). */
  get remoteIpAddress(): string {
    const forwarded = this.request.headers.get('x-forwarded-for')
    return forwarded?.split(',')[0]?.trim()
      || this.request.headers.get('x-real-ip')?.trim()
      || 'unknown'
  }

  get isHttps(): boolean {
    const proto = this.request.headers.get('x-forwarded-proto')
    return (proto ?? this.url.protocol.replace(':', '')).toLowerCase() === 'https'
  }

  getCookie(name: string): string | undefined {
    const header = this.request.headers.get('cookie')
    if (!header) return undefined
    for (const part of header.split(';')) {
      const index = part.indexOf('=')
      if (index < 0) continue
      if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
    }
    return undefined
  }

  /** Reads the JSON body; `undefined` when the body is empty, throws SyntaxError when malformed. */
  async readJsonAsync(): Promise<unknown> {
    this.bodyText ??= this.request.text()
    const text = await this.bodyText
    if (text.trim() === '') return undefined
    return JSON.parse(text) as unknown
  }

  async readFormAsync(): Promise<FormData> {
    this.formData ??= this.request.formData()
    return this.formData
  }
}

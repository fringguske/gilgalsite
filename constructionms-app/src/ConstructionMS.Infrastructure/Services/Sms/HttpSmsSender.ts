import { ServiceUnavailableError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import type { SmsVerificationOptions } from '@/ConstructionMS.Application/Configuration/SmsVerificationOptions'
import type { ISmsSender } from '@/ConstructionMS.Application/Services/Sms/ISmsSender'

const RequestTimeoutMs = 10_000
const DeliveryFailedMessage = 'The SMS could not be sent right now. Try again in a few minutes.'

/** Sends SMS through the httpSMS API: POST /v1/messages/send with the x-api-key header. */
export class HttpSmsSender implements ISmsSender {
  constructor(
    private readonly options: SmsVerificationOptions,
    private readonly logger: ILogger,
  ) {}

  async sendAsync(to: string, content: string): Promise<void> {
    let response: Response
    try {
      response = await fetch(`${this.options.apiBaseUrl}/v1/messages/send`, {
        method: 'POST',
        headers: {
          'x-api-key': this.options.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ from: this.options.fromNumber, to, content }),
        signal: AbortSignal.timeout(RequestTimeoutMs),
      })
    } catch (error) {
      this.logger.error('httpSMS could not be reached.', {}, error)
      throw new ServiceUnavailableError(DeliveryFailedMessage)
    }

    if (!response.ok) {
      // Only httpSMS's explanation is logged (bad key, quota, ...), never the SMS text, which holds the code.
      const reason = await response.json()
        .then((body: { message?: unknown } | null) => typeof body?.message === 'string' ? body.message : '')
        .catch(() => '')
      this.logger.error('httpSMS rejected the message with status {Status}.', {
        Status: response.status,
        Reason: reason.slice(0, 300),
      })
      throw new ServiceUnavailableError(DeliveryFailedMessage)
    }
  }
}

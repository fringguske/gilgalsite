import { ServiceUnavailableError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import { EmailVerificationOptions } from '@/ConstructionMS.Application/Configuration/EmailVerificationOptions'
import type { EmailMessage, IEmailSender } from '@/ConstructionMS.Application/Services/Email/IEmailSender'

const RequestTimeoutMs = 10_000
const DeliveryFailedMessage = 'The email could not be sent right now. Try again in a few minutes.'

/** Sends email through the Resend API: POST /emails with a bearer API key. */
export class ResendEmailSender implements IEmailSender {
  constructor(
    private readonly options: EmailVerificationOptions,
    private readonly logger: ILogger,
  ) {}

  async sendAsync(message: EmailMessage): Promise<void> {
    let response: Response
    try {
      response = await fetch(`${EmailVerificationOptions.ApiBaseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(RequestTimeoutMs),
      })
    } catch (error) {
      this.logger.error('Resend could not be reached.', {}, error)
      throw new ServiceUnavailableError(DeliveryFailedMessage)
    }

    if (!response.ok) {
      // Only Resend's explanation is logged (bad key, unverified domain, ...), never the email, which holds the code.
      const reason = await response.json()
        .then((body: { message?: unknown } | null) => typeof body?.message === 'string' ? body.message : '')
        .catch(() => '')
      this.logger.error('Resend rejected the email with status {Status}.', {
        Status: response.status,
        Reason: reason.slice(0, 300),
      })
      throw new ServiceUnavailableError(DeliveryFailedMessage)
    }
  }
}

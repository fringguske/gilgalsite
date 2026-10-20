import nodemailer, { type Transporter } from 'nodemailer'
import { ServiceUnavailableError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import type { EmailVerificationOptions } from '@/ConstructionMS.Application/Configuration/EmailVerificationOptions'
import type { EmailMessage, IEmailSender } from '@/ConstructionMS.Application/Services/Email/IEmailSender'

const TimeoutMs = 10_000
const DeliveryFailedMessage = 'The email could not be sent right now. Try again in a few minutes.'

/** Sends email over SMTP: TLS from the start on port 465, and STARTTLS (required) on any other port. */
export class SmtpEmailSender implements IEmailSender {
  private readonly transport: Transporter
  private readonly from: string

  constructor(
    options: EmailVerificationOptions,
    private readonly logger: ILogger,
  ) {
    const secure = options.port === 465
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure,
      requireTLS: !secure,
      auth: { user: options.user, pass: options.password },
      connectionTimeout: TimeoutMs,
      greetingTimeout: TimeoutMs,
      socketTimeout: TimeoutMs,
    })
    this.from = options.from
  }

  async sendAsync(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    } catch (error) {
      // Only the server's answer is logged (wrong password, blocked account, ...), never the email, which holds the code.
      const failure = error as { code?: unknown; responseCode?: unknown; response?: unknown; message?: unknown }
      const reason = typeof failure.response === 'string' ? failure.response
        : typeof failure.message === 'string' ? failure.message : ''
      this.logger.error('The SMTP server did not accept the email ({Code}).', {
        Code: typeof failure.code === 'string' ? failure.code : 'unknown',
        ResponseCode: typeof failure.responseCode === 'number' ? failure.responseCode : null,
        Reason: reason.slice(0, 300),
      })
      throw new ServiceUnavailableError(DeliveryFailedMessage)
    }
  }
}

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface IEmailSender {
  sendAsync(message: EmailMessage): Promise<void>
}

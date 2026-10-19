export interface ISmsSender {
  /** Sends a text message to an E.164 phone number. */
  sendAsync(to: string, content: string): Promise<void>
}

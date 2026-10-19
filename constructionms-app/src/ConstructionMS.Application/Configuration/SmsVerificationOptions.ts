/**
 * SMS verification codes are sent through httpSMS (https://httpsms.com), which relays
 * messages through an Android phone running the httpSMS app. When no API key is set the
 * feature is off: password changes need only the current password, as before.
 */
export interface SmsVerificationOptions {
  enabled: boolean
  /** Env: HTTPSMS_API_KEY (httpSMS dashboard -> Settings -> API key). */
  apiKey: string
  /** Env: HTTPSMS_FROM_NUMBER, the SIM number of the phone running the httpSMS app, in E.164 form. */
  fromNumber: string
  /** Env: HTTPSMS_API_URL; only needed to point at a self-hosted httpSMS server. */
  apiBaseUrl: string
}

const E164Pattern = /^\+[1-9]\d{7,14}$/

export const SmsVerificationOptions = Object.freeze({
  SectionName: 'SmsVerification',
  DefaultApiBaseUrl: 'https://api.httpsms.com',

  fromEnvironment(env: NodeJS.ProcessEnv = process.env): SmsVerificationOptions {
    const apiKey = env.HTTPSMS_API_KEY?.trim() ?? ''
    const fromNumber = env.HTTPSMS_FROM_NUMBER?.replace(/[\s\-.()]/g, '') ?? ''
    const apiBaseUrl = (env.HTTPSMS_API_URL?.trim() || SmsVerificationOptions.DefaultApiBaseUrl).replace(/\/+$/, '')
    if (apiKey === '' && fromNumber === '') {
      return { enabled: false, apiKey, fromNumber, apiBaseUrl }
    }
    if (apiKey === '' || fromNumber === '') {
      throw new Error('SmsVerification: set both HTTPSMS_API_KEY and HTTPSMS_FROM_NUMBER, or neither.')
    }
    if (!E164Pattern.test(fromNumber)) {
      throw new Error('SmsVerification: HTTPSMS_FROM_NUMBER must include the country code, e.g. +254712345678.')
    }
    return { enabled: true, apiKey, fromNumber, apiBaseUrl }
  },
})

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, lt } from 'drizzle-orm'
import { InvalidOperationError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { VerificationCodeSentDto } from '@/ConstructionMS.Application/DTOs/Auth/PhoneVerificationDtos'
import type { ISmsSender } from '@/ConstructionMS.Application/Services/Sms/ISmsSender'
import type { PhoneVerificationPurpose } from '@/ConstructionMS.Domain/Entities/PhoneVerificationCode'
import { PhoneNumbers } from '../../Common/PhoneNumbers'
import type { AppDbContext } from '../../Data/AppDbContext'
import { phoneVerificationCodes, users } from '../../Data/schema'

const Minute = 60_000
const CodeLifetimeMs = 10 * Minute
const ResendIntervalMs = Minute
const MaxCodesPerHour = 5
const MaxCodesPerDay = 10
const MaxFailedAttempts = 5
const RetentionMs = 24 * 60 * Minute

const TooManyAttempts = 'Too many incorrect codes. Request a new code.'

const Messages: Record<PhoneVerificationPurpose, (code: string) => string> = {
  ChangePassword: code =>
    `${code} is your Construction Management System code to change your password. It expires in 10 minutes. Never share it.`,
  VerifyPhoneNumber: code =>
    `${code} is your Construction Management System code to confirm this phone number. It expires in 10 minutes.`,
}

/**
 * Issues and checks one-time SMS codes. A code is bound to one account, one purpose and the
 * number it was sent to, works once, and is stored only as an HMAC keyed with AUTH_SECRET.
 */
export class PhoneVerificationService {
  constructor(
    private readonly db: AppDbContext,
    private readonly smsSender: ISmsSender | null,
  ) {}

  get enabled(): boolean {
    return this.smsSender !== null
  }

  /** Lets callers refuse an SMS operation before doing any other work. */
  ensureEnabled(): void {
    this.requireSmsSender()
  }

  async sendCodeAsync(
    userId: number,
    purpose: PhoneVerificationPurpose,
    phoneNumber: string,
  ): Promise<VerificationCodeSentDto> {
    const smsSender = this.requireSmsSender()
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const now = new Date()

    const codeId = await this.db.transaction(async tx => {
      // Locking the account row serialises concurrent requests, so the limits below hold.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
      await tx
        .delete(phoneVerificationCodes)
        .where(and(
          eq(phoneVerificationCodes.userId, userId),
          lt(phoneVerificationCodes.createdAt, new Date(now.getTime() - RetentionMs))))

      const sentToday = await tx
        .select({ createdAt: phoneVerificationCodes.createdAt })
        .from(phoneVerificationCodes)
        .where(eq(phoneVerificationCodes.userId, userId))
        .orderBy(desc(phoneVerificationCodes.createdAt))
      const latest = sentToday[0]?.createdAt
      if (latest && now.getTime() - latest.getTime() < ResendIntervalMs) {
        const seconds = Math.ceil((latest.getTime() + ResendIntervalMs - now.getTime()) / 1000)
        throw new InvalidOperationError(`Wait ${seconds} seconds before requesting another code.`)
      }
      const sentThisHour = sentToday.filter(row => now.getTime() - row.createdAt.getTime() < 60 * Minute)
      if (sentThisHour.length >= MaxCodesPerHour) {
        const oldest = sentThisHour[sentThisHour.length - 1]!.createdAt
        const minutes = Math.ceil((oldest.getTime() + 60 * Minute - now.getTime()) / Minute)
        throw new InvalidOperationError(`Too many codes were requested. Try again in ${minutes} minutes.`)
      }
      if (sentToday.length >= MaxCodesPerDay) {
        throw new InvalidOperationError('Too many codes were requested today. Try again tomorrow or contact your Administrator.')
      }

      const [inserted] = await tx
        .insert(phoneVerificationCodes)
        .values({
          userId,
          purpose,
          phoneNumber,
          codeHash: hashCode(userId, purpose, phoneNumber, code),
          createdAt: now,
          expiresAt: new Date(now.getTime() + CodeLifetimeMs),
        })
        .returning({ id: phoneVerificationCodes.id })
      return inserted!.id
    })

    try {
      await smsSender.sendAsync(phoneNumber, Messages[purpose](code))
    } catch (error) {
      // A code that never arrived must not count against the person's limits.
      await this.db.delete(phoneVerificationCodes).where(eq(phoneVerificationCodes.id, codeId))
      throw error
    }

    return {
      sentTo: PhoneNumbers.mask(phoneNumber),
      expiresAt: new Date(now.getTime() + CodeLifetimeMs),
      resendAvailableAt: new Date(now.getTime() + ResendIntervalMs),
    }
  }

  /**
   * Accepts the most recent code sent for this purpose and returns the number it was sent to.
   * A wrong guess is committed before the error is thrown, so it always counts.
   */
  async consumeCodeAsync(userId: number, purpose: PhoneVerificationPurpose, code: string): Promise<string> {
    this.requireSmsSender()
    const now = new Date()
    const outcome = await this.db.transaction(async (tx): Promise<{ failure: string } | { phoneNumber: string }> => {
      const [latest] = await tx
        .select()
        .from(phoneVerificationCodes)
        .where(and(eq(phoneVerificationCodes.userId, userId), eq(phoneVerificationCodes.purpose, purpose)))
        .orderBy(desc(phoneVerificationCodes.createdAt), desc(phoneVerificationCodes.id))
        .limit(1)
        .for('update')
      if (!latest || latest.consumedAt !== null) {
        return { failure: 'Request a new verification code.' }
      }
      if (latest.expiresAt.getTime() <= now.getTime()) {
        return { failure: 'The verification code has expired. Request a new code.' }
      }
      if (latest.failedAttempts >= MaxFailedAttempts) {
        return { failure: TooManyAttempts }
      }

      if (!hashesMatch(latest.codeHash, hashCode(userId, purpose, latest.phoneNumber, code))) {
        const failedAttempts = latest.failedAttempts + 1
        await tx
          .update(phoneVerificationCodes)
          .set({ failedAttempts })
          .where(eq(phoneVerificationCodes.id, latest.id))
        return { failure: failedAttempts >= MaxFailedAttempts ? TooManyAttempts : 'The verification code is incorrect.' }
      }

      await tx
        .update(phoneVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(phoneVerificationCodes.id, latest.id))
      return { phoneNumber: latest.phoneNumber }
    })

    if ('failure' in outcome) {
      throw new UnauthorizedAccessError(outcome.failure)
    }
    return outcome.phoneNumber
  }

  private requireSmsSender(): ISmsSender {
    if (this.smsSender === null) {
      throw new InvalidOperationError('SMS verification is not set up on this server.')
    }
    return this.smsSender
  }
}

function hashCode(userId: number, purpose: string, phoneNumber: string, code: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.')
  }
  return createHmac('sha256', secret)
    .update(`phone-verification:${userId}:${purpose}:${phoneNumber}:${code}`)
    .digest('hex')
}

function hashesMatch(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, 'hex')
  const candidate = Buffer.from(candidateHash, 'hex')
  return stored.length === candidate.length && timingSafeEqual(stored, candidate)
}

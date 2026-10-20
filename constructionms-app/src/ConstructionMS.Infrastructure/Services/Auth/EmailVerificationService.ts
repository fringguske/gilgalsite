import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, lt } from 'drizzle-orm'
import { InvalidOperationError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { VerificationCodeSentDto } from '@/ConstructionMS.Application/DTOs/Auth/EmailVerificationDtos'
import type { EmailMessage, IEmailSender } from '@/ConstructionMS.Application/Services/Email/IEmailSender'
import type { EmailVerificationPurpose } from '@/ConstructionMS.Domain/Entities/EmailVerificationCode'
import type { AppDbContext } from '../../Data/AppDbContext'
import { emailVerificationCodes, users } from '../../Data/schema'

const Minute = 60_000
const CodeLifetimeMs = 10 * Minute
const ResendIntervalMs = Minute
const MaxCodesPerHour = 5
const MaxCodesPerDay = 10
const MaxFailedAttempts = 5
const RetentionMs = 24 * 60 * Minute

const TooManyAttempts = 'Too many incorrect codes. Request a new code.'

const Purposes: Record<EmailVerificationPurpose, { action: string; notice: string }> = {
  ChangePassword: { action: 'change your password', notice: 'Never share it.' },
  VerifyEmail: { action: 'confirm this email address', notice: 'If you did not ask for it, you can ignore this email.' },
  ResetPassword: { action: 'reset your password', notice: 'If you did not ask for it, tell your Administrator.' },
}

/** The code is in the subject, so it can be read from the notification without opening the email. */
function composeEmail(purpose: EmailVerificationPurpose, code: string): Omit<EmailMessage, 'to'> {
  const { action, notice } = Purposes[purpose]
  return {
    subject: `${code} is your code to ${action}`,
    text: `Your Construction Management System code to ${action} is:\n\n${code}\n\nIt expires in 10 minutes. ${notice}\n`,
    html: `<p>Your Construction Management System code to ${action} is:</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>`
      + `<p>It expires in 10 minutes. ${notice}</p>`,
  }
}

/**
 * Issues and checks one-time emailed codes. A code is bound to one account, one purpose and the
 * address it was sent to, works once, and is stored only as an HMAC keyed with AUTH_SECRET.
 */
export class EmailVerificationService {
  constructor(
    private readonly db: AppDbContext,
    private readonly emailSender: IEmailSender | null,
  ) {}

  get enabled(): boolean {
    return this.emailSender !== null
  }

  /** Lets callers refuse an email-code operation before doing any other work. */
  ensureEnabled(): void {
    this.requireEmailSender()
  }

  async sendCodeAsync(
    userId: number,
    purpose: EmailVerificationPurpose,
    email: string,
  ): Promise<VerificationCodeSentDto> {
    const emailSender = this.requireEmailSender()
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const now = new Date()

    const codeId = await this.db.transaction(async tx => {
      // Locking the account row serialises concurrent requests, so the limits below hold.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
      await tx
        .delete(emailVerificationCodes)
        .where(and(
          eq(emailVerificationCodes.userId, userId),
          lt(emailVerificationCodes.createdAt, new Date(now.getTime() - RetentionMs))))

      const sentToday = await tx
        .select({ createdAt: emailVerificationCodes.createdAt })
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.userId, userId))
        .orderBy(desc(emailVerificationCodes.createdAt))
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
        .insert(emailVerificationCodes)
        .values({
          userId,
          purpose,
          email,
          codeHash: hashCode(userId, purpose, email, code),
          createdAt: now,
          expiresAt: new Date(now.getTime() + CodeLifetimeMs),
        })
        .returning({ id: emailVerificationCodes.id })
      return inserted!.id
    })

    try {
      await emailSender.sendAsync({ to: email, ...composeEmail(purpose, code) })
    } catch (error) {
      // A code that never arrived must not count against the person's limits.
      await this.db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.id, codeId))
      throw error
    }

    return {
      sentTo: email,
      expiresAt: new Date(now.getTime() + CodeLifetimeMs),
      resendAvailableAt: new Date(now.getTime() + ResendIntervalMs),
    }
  }

  /**
   * Accepts the most recent code sent for this purpose and returns the address it was sent to.
   * A wrong guess is committed before the error is thrown, so it always counts.
   */
  async consumeCodeAsync(userId: number, purpose: EmailVerificationPurpose, code: string): Promise<string> {
    this.requireEmailSender()
    const now = new Date()
    const outcome = await this.db.transaction(async (tx): Promise<{ failure: string } | { email: string }> => {
      const [latest] = await tx
        .select()
        .from(emailVerificationCodes)
        .where(and(eq(emailVerificationCodes.userId, userId), eq(emailVerificationCodes.purpose, purpose)))
        .orderBy(desc(emailVerificationCodes.createdAt), desc(emailVerificationCodes.id))
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

      if (!hashesMatch(latest.codeHash, hashCode(userId, purpose, latest.email, code))) {
        const failedAttempts = latest.failedAttempts + 1
        await tx
          .update(emailVerificationCodes)
          .set({ failedAttempts })
          .where(eq(emailVerificationCodes.id, latest.id))
        return { failure: failedAttempts >= MaxFailedAttempts ? TooManyAttempts : 'The verification code is incorrect.' }
      }

      await tx
        .update(emailVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(emailVerificationCodes.id, latest.id))
      return { email: latest.email }
    })

    if ('failure' in outcome) {
      throw new UnauthorizedAccessError(outcome.failure)
    }
    return outcome.email
  }

  private requireEmailSender(): IEmailSender {
    if (this.emailSender === null) {
      throw new InvalidOperationError('Email codes are not set up on this server yet. Ask your Administrator.')
    }
    return this.emailSender
  }
}

function hashCode(userId: number, purpose: string, email: string, code: string): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.')
  }
  return createHmac('sha256', secret)
    .update(`email-verification:${userId}:${purpose}:${email}:${code}`)
    .digest('hex')
}

function hashesMatch(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, 'hex')
  const candidate = Buffer.from(candidateHash, 'hex')
  return stored.length === candidate.length && timingSafeEqual(stored, candidate)
}

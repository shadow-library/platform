/**
 * Importing npm packages
 */
import { createHash, randomInt } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, desc, eq, isNull } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, VerificationChallenge, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { RateLimiterService } from '@server/modules/infrastructure/security';

/**
 * Defining types
 */

export interface IssueChallenge {
  flowId: string;
  type: VerificationChallenge.Type;
  target: string;
  userId?: bigint | null;
  templateKey: string;
}

/**
 * Declaring the constants
 *
 * Tier-2 anti-bombing (architecture §13.2): at most 5 OTP deliveries per identifier per hour,
 * across every flow kind. Exceeding the budget silently skips delivery — a distinguishable
 * refusal would let a caller probe whether an identifier is receiving real mail (D-12).
 */
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const IDENTIFIER_SEND_LIMIT = 5;
const IDENTIFIER_SEND_WINDOW_SECONDS = 3600;

@Injectable()
export class ChallengeService {
  private readonly logger = Logger.getLogger(APP_NAME, ChallengeService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly notificationService: NotificationService,
    private readonly rateLimiter: RateLimiterService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Issues a numeric OTP: persisted as a hash and delivered via the notification outbox. */
  async issue(input: IssueChallenge): Promise<void> {
    const budget = await this.rateLimiter.consume('otp-ident', input.target.toLowerCase(), IDENTIFIER_SEND_LIMIT, IDENTIFIER_SEND_WINDOW_SECONDS);
    if (!budget.allowed) {
      this.logger.warn('OTP delivery suppressed by identifier budget', { securityEvent: 'security.otp_flooding', flowId: input.flowId, type: input.type });
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.db.transaction(async tx => {
      await tx.insert(schema.verificationChallenges).values({
        userId: input.userId ?? null,
        flowId: input.flowId,
        type: input.type,
        target: input.target,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      });
      const recipients = input.type === 'SMS_OTP' ? { phone: input.target } : { email: input.target };
      await this.notificationService.enqueue({ templateKey: input.templateKey, recipients, payload: { code } }, tx);
    });
    this.logger.debug('challenge issued', { flowId: input.flowId, type: input.type });
  }

  /**
   * Verifies the latest unconsumed challenge for a flow. Returns false on expiry, exhausted
   * attempts, or mismatch; increments the attempt counter on a wrong code.
   */
  async verify(flowId: string, code: string): Promise<boolean> {
    return (await this.verifyAndGet(flowId, code)) !== null;
  }

  /** Like `verify`, but returns the consumed challenge so callers can act on its target. */
  async verifyAndGet(flowId: string, code: string): Promise<VerificationChallenge | null> {
    const challenge = await this.db.query.verificationChallenges.findFirst({
      where: and(eq(schema.verificationChallenges.flowId, flowId), isNull(schema.verificationChallenges.consumedAt)),
      orderBy: desc(schema.verificationChallenges.createdAt),
    });
    if (!challenge) return null;
    if (challenge.expiresAt.getTime() <= Date.now() || challenge.attemptCount >= MAX_ATTEMPTS) return null;

    if (this.hashCode(code) !== challenge.codeHash) {
      await this.db
        .update(schema.verificationChallenges)
        .set({ attemptCount: challenge.attemptCount + 1 })
        .where(eq(schema.verificationChallenges.id, challenge.id));
      return null;
    }

    await this.db.update(schema.verificationChallenges).set({ consumedAt: new Date() }).where(eq(schema.verificationChallenges.id, challenge.id));
    return challenge;
  }
}

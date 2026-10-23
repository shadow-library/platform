import { createHash, randomInt } from 'node:crypto';

import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema, VerificationChallenge } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';
import { RateLimiterService } from '@server/modules/infrastructure/security';

export interface IssueChallenge {
  flowId: string;
  type: VerificationChallenge.Type;
  target: string;
  userId?: bigint | null;
  templateKey: string;
}

const CODE_TTL_MINUTES = 10;
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
        expiresAt: sql`now() + make_interval(mins => ${CODE_TTL_MINUTES})`,
      });
      const recipients = input.type === 'SMS_OTP' ? { phone: input.target } : { email: input.target };
      await this.notificationService.enqueue({ templateKey: input.templateKey, recipients, payload: { code } }, tx);
    });
    this.logger.debug('challenge issued', { flowId: input.flowId, type: input.type });
  }

  async verify(flowId: string, code: string): Promise<boolean> {
    return (await this.verifyAndGet(flowId, code)) !== null;
  }

  /** Reserving the attempt before comparing, and consuming only while `consumed_at IS NULL`, keeps concurrent submissions within budget and single-use. */
  async verifyAndGet(flowId: string, code: string): Promise<VerificationChallenge | null> {
    const challenges = schema.verificationChallenges;
    const challenge = await this.db.query.verificationChallenges.findFirst({
      where: and(eq(challenges.flowId, flowId), isNull(challenges.consumedAt)),
      orderBy: desc(challenges.createdAt),
    });
    if (!challenge) return null;

    const reserved = await this.db
      .update(challenges)
      .set({ attemptCount: sql`${challenges.attemptCount} + 1` })
      .where(and(eq(challenges.id, challenge.id), isNull(challenges.consumedAt), lt(challenges.attemptCount, MAX_ATTEMPTS), gt(challenges.expiresAt, sql`now()`)))
      .returning({ id: challenges.id });
    if (reserved.length === 0) return null;
    if (this.hashCode(code) !== challenge.codeHash) return null;

    const [consumed] = await this.db
      .update(challenges)
      .set({ consumedAt: sql`now()` })
      .where(and(eq(challenges.id, challenge.id), isNull(challenges.consumedAt)))
      .returning();
    return consumed ?? null;
  }
}

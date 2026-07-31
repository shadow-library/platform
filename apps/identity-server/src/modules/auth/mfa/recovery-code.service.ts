/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { UserEmailService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { NotificationService } from '@server/modules/infrastructure/notification';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Crockford-style alphabet without lookalike characters (0/O, 1/I/L) so codes survive being read
 * aloud or written down; 10 symbols of 5 bits each carry 50 bits of entropy per code.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;
const BATCH_SIZE = 10;
const USED_TEMPLATE = 'auth.mfa.recovery-code-used';
const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const;

@Injectable()
export class RecoveryCodeService {
  private readonly logger = Logger.getLogger(APP_NAME, RecoveryCodeService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let index = 0; index < CODE_LENGTH; index++) code += CODE_ALPHABET[(bytes[index] as number) % CODE_ALPHABET.length];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }

  private normalize(code: string): string {
    return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  /**
   * Issues a fresh batch of single-use codes, atomically retiring any previous generation. The
   * plaintext codes exist only in the returned array; the database holds argon2id hashes.
   */
  async generate(userId: bigint): Promise<string[]> {
    const codes = Array.from({ length: BATCH_SIZE }, () => this.generateCode());
    const hashes: string[] = [];
    /** Hashed sequentially: ten concurrent argon2id computations would spike ~640 MiB of RAM. */
    for (const code of codes) hashes.push(await Bun.password.hash(this.normalize(code), ARGON2_OPTIONS));

    await this.db.transaction(async tx => {
      const [row] = await tx
        .select({ generation: sql<number>`coalesce(max(${schema.recoveryCodes.generation}), 0)::int` })
        .from(schema.recoveryCodes)
        .where(eq(schema.recoveryCodes.userId, userId));
      const generation = (row?.generation ?? 0) + 1;
      await tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
      await tx.insert(schema.recoveryCodes).values(hashes.map(codeHash => ({ userId, codeHash, generation })));
    });

    await this.auditService.record({ action: 'auth.mfa.recovery_codes_generated', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
    this.logger.info('recovery codes generated', { userId });
    return codes;
  }

  /**
   * Consumes a recovery code as an MFA bypass. The `used_at IS NULL` guard in the update makes
   * consumption single-use even under concurrent attempts; the user is alerted because a bypass
   * of their second factor is a security-relevant event they did not necessarily initiate.
   */
  async consume(userId: bigint, code: string): Promise<boolean> {
    const normalized = this.normalize(code);
    const candidates = await this.db.query.recoveryCodes.findMany({
      where: and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)),
    });

    for (const candidate of candidates) {
      const matches = await Bun.password.verify(normalized, candidate.codeHash).catch(() => false);
      if (!matches) continue;

      const consumed = await this.db
        .update(schema.recoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.recoveryCodes.id, candidate.id), isNull(schema.recoveryCodes.usedAt)))
        .returning({ id: schema.recoveryCodes.id });
      if (consumed.length === 0) return false;

      await this.auditService.record({ action: 'auth.mfa.recovery_code_used', outcome: 'SUCCESS', actorType: 'USER', actorId: userId.toString() });
      const email = await this.userEmailService.getPrimaryEmail(userId);
      if (email) await this.notificationService.enqueue({ templateKey: USED_TEMPLATE, recipients: { email }, payload: { remaining: candidates.length - 1 } });
      this.logger.info('recovery code consumed', { userId, remaining: candidates.length - 1 });
      return true;
    }
    return false;
  }

  async countRemaining(userId: bigint): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.recoveryCodes)
      .where(and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)));
    return row?.count ?? 0;
  }
}

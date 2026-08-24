/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext } from '@modules/auth';
import { CommandBus, type CommandContext, type CommandResult, HeroLedger } from '@modules/commands';
import { type DeltaRow, DeltaSourceRegistry, type SnapshotDeltaSource } from '@modules/sync';
import { AppErrorCode } from '@server/classes';
import { schema } from '@server/database';

import { findCosmetic } from './cosmetic.catalogue';
import { GrantsRepository } from './grants.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const TITLE_DISPLAY = 'title.display';
const COSMETIC_PURCHASE = 'cosmetic.purchase';
const COSMETIC_EQUIP = 'cosmetic.equip';

function requireCosmeticId(payload: Record<string, unknown>): string {
  const value = payload['cosmeticId'];
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError('cosmeticId', "'cosmeticId' is required");
  return value;
}

function toDeltaRow(row: Record<string, unknown>): DeltaRow {
  const serialized: DeltaRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') serialized[key] = String(value);
    else if (value instanceof Date) serialized[key] = value.toISOString();
    else serialized[key] = value;
  }
  return serialized;
}

/**
 * Registers the `title.display` / `cosmetic.purchase` / `cosmetic.equip` command handlers (T-21, command
 * names aligned with `apps/shadow-memoir-web/src/lib/data/hero.types.ts -> HeroCommand`) and the
 * `achievements_earned` / `titles_earned` / `cosmetic_unlocks` snapshot delta sources. Snapshot, not
 * keyset (ARCHITECTURE §12.3): none of the three tables carries `sync_seq`, and each account's set is
 * bounded by the fixed catalogue sizes (17/17/9), so the authoritative full read is cheaper than a
 * watermark column three append-only, grant-frozen tables would otherwise need only for this.
 */
@Injectable()
export class ProgressionCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly heroLedger: HeroLedger,
    private readonly grants: GrantsRepository,
    private readonly accountContext: AccountContext,
    private readonly deltaRegistry: DeltaSourceRegistry,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler(TITLE_DISPLAY, ctx => this.displayTitle(ctx));
    this.commandBus.registerHandler(COSMETIC_PURCHASE, ctx => this.purchaseCosmetic(ctx));
    this.commandBus.registerHandler(COSMETIC_EQUIP, ctx => this.equipCosmetic(ctx));

    this.deltaRegistry.register(this.snapshotSource('achievements_earned', accountId => this.grants.snapshotAchievements(accountId)));
    this.deltaRegistry.register(this.snapshotSource('titles_earned', accountId => this.grants.snapshotTitles(accountId)));
    this.deltaRegistry.register(this.snapshotSource('cosmetic_unlocks', accountId => this.grants.snapshotCosmetics(accountId)));
  }

  private snapshotSource(domain: string, fetch: (accountId: bigint) => Promise<Record<string, unknown>[]>): SnapshotDeltaSource {
    return {
      domain,
      kind: 'snapshot',
      fetch: async () => {
        const accountId = this.accountContext.getAccountId();
        if (accountId === null) return [];
        const rows = await fetch(accountId);
        return rows.map(toDeltaRow);
      },
    };
  }

  /** Titles are never user-selected into existence — only chosen for display among ones already earned (PRD §2.9). */
  private async displayTitle(ctx: CommandContext): Promise<CommandResult> {
    const value = ctx.envelope.payload['titleId'];
    if (value !== null && typeof value !== 'string') throw new ValidationError('titleId', "'titleId' must be a string or null");

    if (value !== null) {
      const earned = await this.grants.listEarnedTitleIds(ctx.tx, ctx.accountId);
      if (!earned.includes(value)) throw AppErrorCode.TTL_001.create();
    }

    await ctx.tx.update(schema.accounts).set({ displayedTitleId: value, updatedAt: new Date() }).where(eq(schema.accounts.id, ctx.accountId));
    return { status: 'applied', result: { displayedTitleId: value } };
  }

  /** §11.3 race semantics: the loser of a concurrent purchase on the same cosmetic finds the unlock already there and converges without charging a second time. */
  private async purchaseCosmetic(ctx: CommandContext): Promise<CommandResult> {
    const cosmeticId = requireCosmeticId(ctx.envelope.payload);
    const cosmetic = findCosmetic(cosmeticId);
    if (!cosmetic) throw AppErrorCode.CSM_002.create();
    if (cosmetic.priceCoins === null) throw AppErrorCode.CSM_004.create();

    const existing = await this.grants.findUnlockedCosmetic(ctx.tx, ctx.accountId, cosmeticId);
    if (existing) return { status: 'superseded', result: { cosmeticId, unlocked: true, charged: false } };

    const [grant] = await this.heroLedger.grant(ctx.tx, ctx.accountId, [
      { dedupeKey: `coinspend_${cosmeticId}`, type: 'coin_spend', date: ctx.envelope.localDate, coinsDelta: -cosmetic.priceCoins },
    ]);
    if (grant?.status === 'duplicate') return { status: 'superseded', result: { cosmeticId, unlocked: true, charged: false } };

    const unlocked = await this.grants.unlockCosmetic(ctx.tx, ctx.accountId, cosmeticId, cosmetic.kind, 'coin');
    if (!unlocked) return { status: 'superseded', result: { cosmeticId, unlocked: true, charged: true } };

    return { status: 'applied', result: { cosmeticId, unlocked: true, charged: true, coinsSpent: cosmetic.priceCoins } };
  }

  private async equipCosmetic(ctx: CommandContext): Promise<CommandResult> {
    const cosmeticId = requireCosmeticId(ctx.envelope.payload);
    const cosmetic = findCosmetic(cosmeticId);
    if (!cosmetic) throw AppErrorCode.CSM_002.create();

    const owned = await this.grants.findUnlockedCosmetic(ctx.tx, ctx.accountId, cosmeticId);
    if (!owned) throw AppErrorCode.CSM_003.create();

    await this.grants.equipCosmetic(ctx.tx, ctx.accountId, cosmeticId, cosmetic.kind);
    return { status: 'applied', result: { cosmeticId, kind: cosmetic.kind, equipped: true } };
  }
}

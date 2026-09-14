export interface TransferOptions {
  organisationId: bigint;
  botId: bigint;
  owners: bigint[];
  /** Only projects with an ingest audit row older than this are candidates */
  before: Date;
  dryRun: boolean;
}

export type TransferOptionsResult = { ok: true; options: TransferOptions } | { ok: false; reason: string };

/**
 * Migration 0037's own date — the earliest a deployment can have cut over, so the default can only ever
 * select too few projects, never a curator's own. An operator passes `--before` with the real deploy
 * timestamp; the run reports the count, so selecting too few is visible and re-runnable.
 */
export const DEFAULT_CUTOVER = '2026-09-14T00:00:00.000Z';

export const USAGE = `Usage: bun src/transfer-curated-projects.ts --org <organisationId> --bot <botId> --owner <userId>[,<userId>...] [--before <ISO instant>] [--dry-run]

  --org      the organisation the bot belongs to; stamped on every transferred project
  --bot      the curation bot that becomes the owner
  --owner    the curators whose pre-cutover projects move; required — there is no sweep-everything mode
  --before   only projects ingested before this instant (default ${DEFAULT_CUTOVER}); pass the deploy timestamp
  --dry-run  report what would change and write nothing`;

const ID_PATTERN = /^\d+$/;

function readValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * Parsed rather than thrown so the whole surface is testable: this script rewrites ownership, and a flag
 * that silently parses to the wrong thing moves the wrong projects. `BigInt('')` is `0n`, which is why ids
 * are pattern-checked instead of handed straight to `BigInt`.
 */
export function parseTransferOptions(args: string[]): TransferOptionsResult {
  const org = readValue(args, '--org');
  const bot = readValue(args, '--bot');
  const owner = readValue(args, '--owner');
  if (!org || !bot || !owner) return { ok: false, reason: '--org, --bot and --owner are all required' };
  if (!ID_PATTERN.test(org)) return { ok: false, reason: `--org must be a numeric id, got "${org}"` };
  if (!ID_PATTERN.test(bot)) return { ok: false, reason: `--bot must be a numeric id, got "${bot}"` };

  const owners: bigint[] = [];
  for (const value of owner.split(',')) {
    const trimmed = value.trim();
    if (!ID_PATTERN.test(trimmed)) return { ok: false, reason: `--owner must be a comma-separated list of numeric ids, got "${value}"` };
    owners.push(BigInt(trimmed));
  }

  const beforeValue = readValue(args, '--before') ?? DEFAULT_CUTOVER;
  const before = new Date(beforeValue);
  if (Number.isNaN(before.getTime())) return { ok: false, reason: `--before must be an ISO instant, got "${beforeValue}"` };

  return { ok: true, options: { organisationId: BigInt(org), botId: BigInt(bot), owners, before, dryRun: args.includes('--dry-run') } };
}

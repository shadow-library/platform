/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { CommandEnvelopeDto } from '@modules/commands';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const MAX_BATCH_SIZE = 100;

@Schema()
export class SyncCommandBatchDto {
  @Field(() => [CommandEnvelopeDto], {
    minItems: 1,
    maxItems: MAX_BATCH_SIZE,
    description: 'Outbox entries in the order the user performed them; the server applies them strictly in this order, each in its own transaction',
    errorMessage: { maxItems: `A sync batch carries at most {limit} commands`, minItems: 'A sync batch must carry at least one command' },
  })
  commands: CommandEnvelopeDto[];
}

@Schema()
export class SyncCommandErrorDto {
  @Field()
  code: string;

  @Field()
  message: string;
}

@Schema()
export class SyncCommandOutcomeDto {
  @Field()
  commandId: string;

  @Field({ description: "'applied' | 'rejected' | 'superseded' from the handler, or 'failed' when the command's transaction rolled back and it must be resent" })
  status: string;

  @Field(() => Object, {
    additionalProperties: true,
    description: 'The handler result, replayed verbatim on resend; entity_ref → id mappings for offline-created entities live here (§12.4)',
  })
  result: Record<string, unknown>;

  @Field({ description: 'True when this outcome was read back from command_log rather than produced by running the handler again' })
  replayed: boolean;

  @Field(() => SyncCommandErrorDto, { optional: true })
  error?: SyncCommandErrorDto;
}

@Schema()
export class SyncCommandBatchResponseDto {
  @Field(() => [SyncCommandOutcomeDto], { description: 'One outcome per command applied; a batch cut short by a failure returns fewer outcomes than it received commands' })
  outcomes: SyncCommandOutcomeDto[];
}

@Schema()
export class SyncDeltaQueryDto {
  @Field(() => String, { default: '0', pattern: '^\\d+$', description: 'The cursor from the previous pull; 0 requests a full initial sync' })
  @Transform('bigint:parse')
  since: bigint;

  @Field({ optional: true, pattern: '^[a-z_]+(,[a-z_]+)*$', description: 'Comma-separated domain names to restrict the pull to; every registered domain is returned when omitted' })
  domains?: string;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 1000, description: 'Rows per keyset domain in this page; defaults to the server page size' })
  limit?: number;
}

@Schema()
export class SyncTombstoneDto {
  @Field({ description: 'The domain the deleted row belonged to' })
  domain: string;

  @Field({ description: 'Primary key of the deleted row, stringified' })
  recordId: string;

  @Field(() => String)
  syncSeq: bigint;
}

@Schema()
export class SyncDeltaResponseDto {
  @Field(() => String, { description: 'Cursor to send as `since` on the next pull; it lags the newest change slightly so late-committing rows are re-served' })
  cursor: bigint;

  @Field({ description: 'True while a keyset domain still has rows past this page — pull again immediately rather than waiting for the next sync tick' })
  hasMore: boolean;

  @Field(() => Object, { additionalProperties: true, description: 'Rows per domain, keyed by domain name; each row is upserted by primary key, so redelivery is harmless' })
  domains: Record<string, unknown[]>;

  @Field(() => [SyncTombstoneDto], { description: 'Rows deleted since the cursor, to be removed from the local store' })
  tombstones: SyncTombstoneDto[];
}

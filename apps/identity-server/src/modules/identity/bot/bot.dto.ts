import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';

const BOT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED'] as const;
const BOT_KEY_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;

type BotStatus = (typeof BOT_STATUSES)[number];
type BotKeyStatus = (typeof BOT_KEY_STATUSES)[number];

@Schema()
export class BotParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  botId: bigint;
}

@Schema()
export class BotKeyParams extends BotParams {
  @Field({ ...PATTERN.UUID })
  keyId: string;
}

@Schema()
export class CreateBotBody {
  @Field({
    ...PATTERN.BOT_HANDLE,
    minLength: 1,
    maxLength: 39,
    description: 'Organisation-unique handle rendered as `<handle>[bot]` on everything the bot owns; it can never change.',
  })
  handle: string;

  @Field({ minLength: 1, maxLength: 64 })
  displayName: string;

  @Field({ optional: true, minLength: 1, maxLength: 280 })
  description?: string;

  @Field(() => [String], {
    optional: true,
    maxItems: 20,
    description: 'IPv4 or IPv6 addresses or CIDR ranges allowed to exchange the bot keys; host bits are cleared and duplicates dropped. Empty allows every address.',
  })
  ipAllowlist?: string[];

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 600, description: 'Requests per minute each app accepts from the bot. Defaults to 600, which is also the ceiling.' })
  rateLimitPerMinute?: number;
}

@Schema()
export class UpdateBotBody {
  @Field({ optional: true, minLength: 1, maxLength: 64 })
  displayName?: string;

  @Field(() => String, { optional: true, nullable: true, minLength: 1, maxLength: 280, description: 'null clears the description.' })
  description?: string | null;

  @Field(() => [String], { optional: true, maxItems: 20, description: 'Replaces the full allowlist; the same rules as creation apply and an empty list allows every address.' })
  ipAllowlist?: string[];

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 600 })
  rateLimitPerMinute?: number;
}

@Schema()
export class CreateBotKeyBody {
  @Field({ minLength: 1, maxLength: 64, description: 'Where the key will live, such as the CI system or environment that holds it.' })
  name: string;

  @Field({ minLength: 1, maxLength: 64, description: 'ISO-8601 expiry, strictly in the future and at most 365 days away.' })
  expiresAt: string;
}

@Schema()
export class BotUserItem {
  @Field(() => String)
  id: bigint;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;
}

@Schema()
export class BotItem {
  @Field(() => String)
  id: bigint;

  @Field({ description: 'OAuth client backing the bot; it is the principal id in role assignments and issued tokens.' })
  clientId: string;

  @Field()
  handle: string;

  @Field()
  displayName: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  description?: string;

  @Field(() => String, { enum: [...BOT_STATUSES] })
  status: BotStatus;

  @Field(() => [String])
  ipAllowlist: string[];

  @Field(() => Integer)
  rateLimitPerMinute: number;

  @Field(() => Integer, { description: 'Keys that are neither revoked nor expired.' })
  activeKeyCount: number;

  @Field(() => String, { optional: true, description: 'Most recent use of any of the bot keys.' })
  @Transform('strip:null')
  lastUsedAt?: string;

  @Field(() => String, { optional: true, description: 'Caller address of that most recent use.' })
  @Transform('strip:null')
  lastUsedIp?: string;

  @Field(() => BotUserItem, { optional: true })
  @Transform('strip:null')
  createdBy?: BotUserItem;

  @Field()
  createdAt: string;

  @Field()
  updatedAt: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  suspendedAt?: string;

  @Field(() => BotUserItem, { optional: true })
  @Transform('strip:null')
  suspendedBy?: BotUserItem;
}

@Schema()
export class BotUsageItem {
  @Field(() => Integer, { description: 'Bots that count toward the limit: every bot not yet deleted.' })
  count: number;

  @Field(() => Integer)
  limit: number;
}

@Schema()
export class BotsResponse {
  @Field(() => [BotItem])
  bots: BotItem[];

  @Field(() => BotUsageItem)
  usage: BotUsageItem;
}

@Schema()
export class BotKeyItem {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ description: 'First 16 characters of the key, safe to display for recognising it.' })
  keyPrefix: string;

  @Field(() => String, { enum: [...BOT_KEY_STATUSES], description: 'REVOKED wins over EXPIRED when both apply.' })
  status: BotKeyStatus;

  @Field()
  expiresAt: string;

  @Field()
  createdAt: string;

  @Field(() => BotUserItem, { optional: true })
  @Transform('strip:null')
  createdBy?: BotUserItem;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  lastUsedAt?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  lastUsedIp?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  revokedAt?: string;

  @Field(() => BotUserItem, { optional: true })
  @Transform('strip:null')
  revokedBy?: BotUserItem;
}

@Schema()
export class BotKeysResponse {
  @Field(() => [BotKeyItem])
  keys: BotKeyItem[];
}

@Schema()
export class CreatedBotKeyResponse extends BotKeyItem {
  @Field({ description: 'The full key, returned exactly once; only a SHA-256 hash of its secret is stored.' })
  key: string;
}

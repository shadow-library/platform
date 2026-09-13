import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';
import { type AuditEvent } from '@server/modules/infrastructure/datastore';

import { BOT_AUDIT_ACTIONS, type BotAuditAction } from './bot.constants';

const BOT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED'] as const;
const BOT_KEY_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
const BOT_GRANT_LEVELS = ['read', 'write'] as const;
const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILURE'] as const;
const AUDIT_ACTOR_TYPES = ['USER', 'SERVICE_ACCOUNT', 'SYSTEM', 'ADMIN'] as const;

type BotStatus = (typeof BOT_STATUSES)[number];
type BotKeyStatus = (typeof BOT_KEY_STATUSES)[number];
type BotGrantLevel = (typeof BOT_GRANT_LEVELS)[number];

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
export class BotGrantBody {
  @Field(() => Integer, { minimum: 1, description: 'Application the grant belongs to, as listed by the bot permission catalog.' })
  applicationId: number;

  @Field({ minLength: 1, maxLength: 64, description: 'Resource the application declares the grant under, such as `members`.' })
  resource: string;

  @Field(() => String, { enum: [...BOT_GRANT_LEVELS], description: '`write` implies `read`; send one level per resource.' })
  level: BotGrantLevel;
}

@Schema()
export class ReplaceBotPermissionsBody {
  @Field(() => [BotGrantBody], {
    maxItems: 100,
    description:
      'The full desired set of grants, identified by application, resource and level. Every grant made here that the set omits is revoked — including one whose role has since stopped being bot-grantable, which no set can name and which is therefore always revoked by the next write. Assignments applied by platform staff are never touched. Every entry is re-validated server-side.',
  })
  grants: BotGrantBody[];
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

  @Field(() => [BotGrantBody], {
    optional: true,
    maxItems: 100,
    description: 'Grants to apply in the same transaction as the creation, validated exactly as the permissions endpoint validates them.',
  })
  grants?: BotGrantBody[];
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

  @Field({
    ...PATTERN.ISO_DATE_TIME,
    description: 'ISO-8601 date-time with seconds and a time zone, such as 2027-03-07T09:30:00Z; strictly in the future and at most 365 days away.',
  })
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

  @Field(() => String, { optional: true, description: 'Earliest expiry among the keys that are neither revoked nor expired; absent when the bot has no active key.' })
  @Transform('strip:null')
  nextKeyExpiresAt?: string;

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

@Schema()
export class BotCatalogLevelItem {
  @Field(() => Integer, { description: 'Application role backing this level; grants are still requested by resource and level.' })
  roleId: number;

  @Field()
  roleName: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  description?: string;

  @Field(() => String, { enum: [...BOT_GRANT_LEVELS] })
  level: BotGrantLevel;

  @Field(() => Boolean, { description: 'The application flags this grant as sensitive, such as a spend-incurring action.' })
  sensitive: boolean;

  @Field(() => Boolean, { description: 'The role is declared bot-grantable by an application this organisation reaches. Only eligible grants are catalogued.' })
  eligible: boolean;

  @Field(() => Boolean, { description: 'You hold this permission in the organisation and may therefore grant it. Advisory only — the server re-checks it on every write.' })
  heldByYou: boolean;
}

@Schema()
export class BotCatalogResourceItem {
  @Field()
  resource: string;

  @Field(() => [BotCatalogLevelItem], { description: 'Ordered read before write.' })
  levels: BotCatalogLevelItem[];
}

@Schema()
export class BotCatalogApplicationItem {
  @Field(() => Integer)
  applicationId: number;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  logoUrl?: string;

  @Field(() => [BotCatalogResourceItem])
  resources: BotCatalogResourceItem[];
}

@Schema()
export class BotPermissionCatalogResponse {
  @Field(() => [BotCatalogApplicationItem], { description: 'Applications this organisation can reach that declare bot-grantable roles, ordered by application name.' })
  applications: BotCatalogApplicationItem[];
}

@Schema()
export class BotGrantItem {
  @Field(() => Integer)
  roleId: number;

  @Field()
  roleName: string;

  @Field(() => Integer)
  applicationId: number;

  @Field()
  application: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  applicationDisplayName?: string;

  @Field(() => String, { optional: true, description: 'Absent once the application stops declaring the role bot-grantable; the next permissions write drops such a grant.' })
  @Transform('strip:null')
  resource?: string;

  @Field(() => String, { optional: true, enum: [...BOT_GRANT_LEVELS] })
  @Transform('strip:null')
  level?: BotGrantLevel;

  @Field(() => Boolean)
  sensitive: boolean;

  @Field(() => Boolean, { description: 'The role is still declared bot-grantable by its application.' })
  eligible: boolean;

  @Field()
  grantedAt: string;

  @Field(() => BotUserItem, { optional: true })
  @Transform('strip:null')
  grantedBy?: BotUserItem;

  @Field(() => Boolean, { description: 'False when the granting administrator no longer holds this permission. The grant stays in force until an admin removes it.' })
  granterHoldsPermission: boolean;

  @Field(() => Boolean, {
    description:
      'This grant was made here and a permissions write can change it. False for an assignment applied by platform staff, shown for transparency but never altered by a write here.',
  })
  managed: boolean;
}

@Schema()
export class BotPermissionsResponse {
  @Field(() => [BotGrantItem])
  grants: BotGrantItem[];
}

@Schema()
export class BotActivityQuery {
  @Field(() => Integer, { default: 25, minimum: 1, maximum: 100 })
  limit: number;

  @Field({ optional: true, maxLength: 128, description: 'Opaque cursor from a previous page; omit for the newest events.' })
  cursor?: string;

  @Field(() => String, { optional: true, enum: [...BOT_AUDIT_ACTIONS] })
  action?: BotAuditAction;

  @Field(() => String, { optional: true, enum: [...AUDIT_OUTCOMES] })
  outcome?: AuditEvent.Outcome;
}

@Schema()
export class BotActivityDetailItem {
  @Field(() => String, { optional: true, description: 'Why a key exchange was refused, such as `ip_not_allowed`.' })
  @Transform('strip:null')
  reason?: string;

  @Field(() => String, { optional: true, description: '`exchange` for a resource server swapping the key for a token, `direct` for a call to identity itself.' })
  @Transform('strip:null')
  purpose?: string;

  @Field(() => [String], { optional: true, description: 'Bot fields the update changed.' })
  @Transform('strip:null')
  fields?: string[];

  @Field(() => [String], { optional: true, description: 'Grants added, each `<application>:<resource>:<level>`.' })
  @Transform('strip:null')
  added?: string[];

  @Field(() => [String], { optional: true, description: 'Grants removed, each `<application>:<resource>:<level>`.' })
  @Transform('strip:null')
  removed?: string[];
}

@Schema()
export class BotActivityItem {
  @Field()
  id: string;

  @Field()
  occurredAt: string;

  @Field()
  action: string;

  @Field(() => String, { enum: [...AUDIT_OUTCOMES] })
  outcome: AuditEvent.Outcome;

  @Field(() => String, { enum: [...AUDIT_ACTOR_TYPES] })
  actorType: AuditEvent.ActorType;

  @Field(() => BotUserItem, { optional: true, description: 'Present when a person acted; a bot acting on its own key is identified by the key instead.' })
  @Transform('strip:null')
  actor?: BotUserItem;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  keyId?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  keyName?: string;

  @Field(() => String, { optional: true, description: 'Caller address recorded with the event.' })
  @Transform('strip:null')
  ip?: string;

  @Field(() => BotActivityDetailItem, { optional: true })
  @Transform('strip:null')
  detail?: BotActivityDetailItem;
}

@Schema()
export class BotActivityResponse {
  @Field(() => [BotActivityItem], { description: 'Newest first.' })
  events: BotActivityItem[];

  @Field(() => String, { optional: true, description: 'Pass as `cursor` for the next page; absent on the last page.' })
  @Transform('strip:null')
  nextCursor?: string;
}

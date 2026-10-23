import { type BotActivityAction, type BotActivityDetailItem, type BotActivityItem, type BotActivityOutcome } from '@/lib/apis';
import { humanizeResource } from '@/lib/bot-permissions';

export const OUTCOME_META: Record<BotActivityOutcome, { label: string; intent: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SUCCESS: { label: 'Success', intent: 'success' },
  DENIED: { label: 'Refused', intent: 'danger' },
  FAILURE: { label: 'Failed', intent: 'danger' },
};

export const ACTION_LABEL: Record<BotActivityAction, string> = {
  'bot.created': 'Created',
  'bot.updated': 'Updated',
  'bot.suspended': 'Suspended',
  'bot.resumed': 'Resumed',
  'bot.permissions.changed': 'Permissions changed',
  'bot.key.created': 'Key generated',
  'bot.key.revoked': 'Key revoked',
  'bot.key.expired': 'Key expired',
  'bot.key.used': 'Key used',
  'bot.key.exchange_denied': 'Key exchange refused',
  'bot.deletion.requested': 'Deletion requested',
  'bot.ownership.transferred': 'Ownership transferred',
  'bot.deleted': 'Deleted',
};

const REFUSAL_REASON_LABEL: Record<string, string> = {
  ip_not_allowed: 'IP not in allowlist',
  key_expired: 'key expired',
  key_revoked: 'key revoked',
  bot_suspended: 'bot suspended',
  rate_limited: 'rate limit reached',
};

function humanizeCode(value: string): string {
  return REFUSAL_REASON_LABEL[value] ?? value.replace(/_/g, ' ');
}

function humanizeField(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function formatGrantLabel(raw: string): string {
  const [, resource, level] = raw.split(':');
  return resource && level ? `${humanizeResource(resource)} · ${level}` : raw;
}

function permissionsChangeSummary(detail: BotActivityDetailItem | undefined): string {
  const added = detail?.added ?? [];
  const removed = detail?.removed ?? [];
  const [firstAdded] = added;
  const [firstRemoved] = removed;
  if (added.length > 0 && removed.length === 0) return added.length === 1 && firstAdded ? `granted ${formatGrantLabel(firstAdded)}` : `granted ${added.length} permissions`;
  if (removed.length > 0 && added.length === 0) return removed.length === 1 && firstRemoved ? `revoked ${formatGrantLabel(firstRemoved)}` : `revoked ${removed.length} permissions`;
  if (added.length > 0 && removed.length > 0) return `changed ${added.length + removed.length} permissions`;
  return 'changed permissions';
}

export function describeEvent(event: BotActivityItem): string {
  const actorName = event.actor?.displayName ?? 'A former member';
  switch (event.action as BotActivityAction) {
    case 'bot.created':
      return `${actorName} created the bot`;
    case 'bot.updated':
      return `${actorName} updated ${event.detail?.fields?.map(humanizeField).join(', ') || 'the bot'}`;
    case 'bot.suspended':
      return `${actorName} suspended the bot`;
    case 'bot.resumed':
      return `${actorName} resumed the bot`;
    case 'bot.permissions.changed':
      return `${actorName} ${permissionsChangeSummary(event.detail)}`;
    case 'bot.key.created':
      return `${actorName} generated key ${event.keyName ?? ''}`.trim();
    case 'bot.key.revoked':
      return `${actorName} revoked key ${event.keyName ?? ''}`.trim();
    case 'bot.key.expired':
      return `Key ${event.keyName ?? ''} expired`.trim();
    case 'bot.key.used':
      return `Key ${event.keyName ?? 'key'} used`;
    case 'bot.key.exchange_denied':
      return `Key exchange refused${event.detail?.reason ? `: ${humanizeCode(event.detail.reason)}` : ''}`;
    case 'bot.deletion.requested':
      return event.detail?.retriedTransfers ? `${actorName} retried the record transfer` : `${actorName} requested deletion`;
    case 'bot.ownership.transferred':
      return `${actorName} transferred ownership`;
    case 'bot.deleted':
      return `${actorName} deleted the bot`;
    default:
      return event.action;
  }
}

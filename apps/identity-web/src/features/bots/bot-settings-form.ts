import { type BotItem, type UpdateBotBody } from '@/lib/apis';
import { isValidRateLimit, rateLimitError } from '@/lib/bot-rate-limit';

export interface IpToken {
  value: string;
  valid: boolean;
}

export interface BotSettingsDraft {
  displayName: string;
  description: string;
  ipAllowlist: IpToken[];
  rateLimitPerMinute: number | null;
}

export type BotSettingsOverrides = Partial<BotSettingsDraft>;

export type BotSettingsSource = Pick<BotItem, 'displayName' | 'description' | 'ipAllowlist' | 'rateLimitPerMinute'>;

export interface BotSettingsErrors {
  displayName?: string;
  ipAllowlist?: string;
  rateLimitPerMinute?: string;
}

export function settingsBaseline(bot: BotSettingsSource): BotSettingsDraft {
  return {
    displayName: bot.displayName,
    description: bot.description ?? '',
    ipAllowlist: bot.ipAllowlist.map(value => ({ value, valid: true })),
    rateLimitPerMinute: bot.rateLimitPerMinute,
  };
}

export function applyOverrides(baseline: BotSettingsDraft, overrides: BotSettingsOverrides): BotSettingsDraft {
  return { ...baseline, ...overrides };
}

export function settingsErrors(draft: BotSettingsDraft): BotSettingsErrors {
  return {
    displayName: draft.displayName.trim() ? undefined : 'Enter a display name.',
    ipAllowlist: draft.ipAllowlist.some(token => !token.valid) ? 'Fix or remove the invalid IP range before continuing.' : undefined,
    rateLimitPerMinute: rateLimitError(draft.rateLimitPerMinute),
  };
}

export function hasErrors(errors: BotSettingsErrors): boolean {
  return Object.values(errors).some(message => message !== undefined);
}

function validIps(tokens: readonly IpToken[]): string[] {
  return tokens.filter(token => token.valid).map(token => token.value);
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function settingsPatch(baseline: BotSettingsDraft, draft: BotSettingsDraft): UpdateBotBody {
  const patch: UpdateBotBody = {};
  const displayName = draft.displayName.trim();
  if (displayName && displayName !== baseline.displayName) patch.displayName = displayName;

  const description = draft.description.trim() || null;
  if (description !== (baseline.description.trim() || null)) patch.description = description;

  const ipAllowlist = validIps(draft.ipAllowlist);
  if (!sameList(ipAllowlist, validIps(baseline.ipAllowlist))) patch.ipAllowlist = ipAllowlist;

  const rate = draft.rateLimitPerMinute;
  if (isValidRateLimit(rate) && rate !== baseline.rateLimitPerMinute) patch.rateLimitPerMinute = rate;
  return patch;
}

export function canSaveSettings(baseline: BotSettingsDraft, draft: BotSettingsDraft): boolean {
  return Object.keys(settingsPatch(baseline, draft)).length > 0 && !hasErrors(settingsErrors(draft));
}

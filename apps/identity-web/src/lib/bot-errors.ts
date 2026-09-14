import { type ApiError } from './apis/transport';

const BOT_ERROR_MESSAGES: Record<string, string> = {
  BOT_001: 'This organization has reached its bot limit.',
  BOT_002: 'Bots are only available to team organizations.',
  BOT_003: 'That handle is already taken in this organization.',
  BOT_004: 'One of these permissions can’t be granted right now — the app may be unreachable or no longer offers it. Refresh and try again.',
  BOT_005: 'You don’t hold one or more of the permissions you tried to grant. Remove them from your selection, or ask an admin who holds them to grant it.',
  BOT_006: 'This bot already has two active keys — revoke one before generating another.',
  BOT_007: 'Choose an expiry after today and at most a year from now.',
  BOT_008: 'That person isn’t an active member of this organization any more — choose someone else to receive the records.',
  BOT_009: 'This bot no longer exists.',
  BOT_010: 'That isn’t available while the bot is in its current status.',
  BOT_011: 'This key no longer exists.',
  BOT_012: 'One of the IP ranges isn’t valid.',
  BOT_013: 'This organization isn’t active.',
};

export function botErrorMessage(error: ApiError): string {
  return BOT_ERROR_MESSAGES[error.code] ?? error.message;
}

export type BotFieldErrorTarget = 'handle' | 'ipAllowlist' | 'expiresAt' | 'transferToUserId';

const BOT_FIELD_ERRORS: Partial<Record<string, BotFieldErrorTarget>> = {
  BOT_003: 'handle',
  BOT_012: 'ipAllowlist',
  BOT_007: 'expiresAt',
  BOT_008: 'transferToUserId',
};

/** Maps a conflict/validation code with no server-side field detail onto the form field it concerns. */
export function botFieldError(error: ApiError): { field: BotFieldErrorTarget; message: string } | null {
  const field = BOT_FIELD_ERRORS[error.code];
  return field ? { field, message: botErrorMessage(error) } : null;
}

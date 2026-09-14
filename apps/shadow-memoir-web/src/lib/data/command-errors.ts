import { type CommandErrorKind } from './command.types';

interface ErrorEntry {
  kind: CommandErrorKind;
  copy: string;
}

export const NETWORK_ERROR_CODE = 'NETWORK';

/**
 * shadow-memoir-server's error codes in the owner's words. The wire carries only `{ code, message }` and no
 * retryable flag; a `failed` sync outcome is a domain or validation error (an internal one fails the whole batch
 * with a 500), so only the capacity and availability codes marked `unavailable` here are worth resending.
 */
const ERROR_CATALOGUE: Record<string, ErrorEntry> = {
  ACC_001: { kind: 'refusal', copy: 'An account already exists for this sign-in.' },
  ACC_002: { kind: 'unavailable', copy: 'This account is being deleted, so changes can’t be saved.' },
  ACC_003: { kind: 'refusal', copy: 'Setup was already finished for this account.' },
  ACC_004: { kind: 'refusal', copy: 'That setting can’t be changed.' },
  CMD_001: { kind: 'refusal', copy: 'This version of the app sent a change the server doesn’t know. Reload to update.' },
  DEV_001: { kind: 'refusal', copy: 'That device isn’t linked to your account any more.' },
  HRO_001: { kind: 'refusal', copy: 'You don’t have enough coins for that.' },
  QST_001: { kind: 'refusal', copy: 'It has already been moved once.' },
  QST_002: { kind: 'refusal', copy: 'That quest isn’t in your plan any more.' },
  QST_003: { kind: 'refusal', copy: 'Anchor quests need a start time.' },
  QST_004: { kind: 'refusal', copy: 'That quest isn’t scheduled on that day.' },
  QST_005: { kind: 'refusal', copy: 'Postpone isn’t available for this kind of quest.' },
  QST_006: { kind: 'refusal', copy: 'Entries older than 7 days can’t be changed.' },
  QST_007: { kind: 'refusal', copy: 'There’s nothing logged for that quest to change.' },
  QST_008: { kind: 'refusal', copy: 'This quest has no set time to move.' },
  RCV_001: { kind: 'refusal', copy: 'There’s no recovery quest waiting today.' },
  LCK_001: { kind: 'refusal', copy: 'That quest isn’t in your plan any more.' },
  LCK_002: { kind: 'refusal', copy: 'That day is already closed.' },
  CSM_001: { kind: 'refusal', copy: 'It’s already yours.' },
  CSM_002: { kind: 'refusal', copy: 'That item isn’t available.' },
  CSM_003: { kind: 'refusal', copy: 'Unlock it before equipping it.' },
  CSM_004: { kind: 'refusal', copy: 'That item comes with an achievement, not with coins.' },
  TTL_001: { kind: 'refusal', copy: 'That title hasn’t been earned yet.' },
  FIN_001: { kind: 'refusal', copy: 'A category with that name already exists.' },
  FIN_002: { kind: 'refusal', copy: 'That charge was already confirmed.' },
  FIN_003: { kind: 'refusal', copy: 'That expense no longer exists.' },
  FIN_004: { kind: 'refusal', copy: 'That subscription no longer exists.' },
  FIN_005: { kind: 'refusal', copy: 'That category no longer exists.' },
  FIN_006: { kind: 'refusal', copy: 'A saved expense’s currency can’t be changed. Delete it and add it again.' },
  FIN_007: { kind: 'refusal', copy: 'Uncategorised and Subscriptions are always kept, so they can’t be archived.' },
  OCR_001: { kind: 'unavailable', copy: 'Today’s receipt scans are used up.' },
  OCR_002: { kind: 'unavailable', copy: 'Receipt scanning isn’t available right now.' },
  MET_001: { kind: 'refusal', copy: 'A metric with that name already exists.' },
  MET_002: { kind: 'refusal', copy: 'That metric no longer exists.' },
  MET_003: { kind: 'refusal', copy: 'Built-in metrics can’t be changed.' },
  MET_004: { kind: 'refusal', copy: 'A quest still uses that metric.' },
  QLG_001: { kind: 'refusal', copy: 'That meal preset no longer exists.' },
  BIL_002: { kind: 'refusal', copy: 'That payment provider isn’t available.' },
  BIL_003: { kind: 'unavailable', copy: 'Payments aren’t available right now.' },
  RCP_001: { kind: 'refusal', copy: 'That receipt no longer exists.' },
  RCP_002: { kind: 'refusal', copy: 'Receipts need to be a JPEG, PNG, WebP or HEIC image.' },
  RCP_003: { kind: 'refusal', copy: 'That receipt image is too large.' },
  RCP_004: { kind: 'refusal', copy: 'The receipt didn’t finish uploading. Try adding it again.' },
  AI_001: { kind: 'refusal', copy: 'Both requests this month are used. Coach raises the allowance, and the count resets on its own.' },
  AI_002: { kind: 'unavailable', copy: 'Today’s requests are used up. Try again tomorrow.' },
  AI_003: { kind: 'refusal', copy: 'That request is no longer here.' },
  AI_004: { kind: 'refusal', copy: 'It has already started, so it can’t be cancelled.' },
  AI_005: { kind: 'refusal', copy: 'Scheduled summaries come with Coach.' },
  AI_006: { kind: 'refusal', copy: 'That result is no longer here.' },
  AI_007: { kind: 'refusal', copy: 'That suggestion is no longer available.' },
  AI_008: { kind: 'refusal', copy: 'The quest that suggestion points to no longer exists.' },
  AI_009: { kind: 'unavailable', copy: 'Coaching isn’t available right now.' },
  AI_010: { kind: 'unavailable', copy: 'Coaching isn’t available right now.' },
  AI_011: { kind: 'refusal', copy: 'Your consent choice was already made on another device, so nothing was changed here.' },
  EXP_001: { kind: 'refusal', copy: 'That export is no longer available.' },
  EXP_002: { kind: 'refusal', copy: 'You’ve already asked for an export today. Try again tomorrow.' },
  VALIDATION_ERROR: { kind: 'refusal', copy: 'Some of the details weren’t valid.' },
  SYN_001: { kind: 'refusal', copy: 'This version of the app asked for data the server doesn’t know. Reload to update.' },
  API_REQUEST_TIMEOUT: { kind: 'unavailable', copy: 'Shadow Memoir took too long to answer.' },
  API_REQUEST_NETWORK_ERROR: { kind: 'unavailable', copy: 'Couldn’t reach Shadow Memoir.' },
  S001: { kind: 'unavailable', copy: 'Something went wrong on our side.' },
  S002: { kind: 'refusal', copy: 'That’s no longer available.' },
  S003: { kind: 'refusal', copy: 'Some of the details weren’t valid.' },
  S004: { kind: 'unavailable', copy: 'You’re signed out.' },
  S005: { kind: 'refusal', copy: 'You don’t have access to that.' },
  S006: { kind: 'refusal', copy: 'Some of the details weren’t valid.' },
  S007: { kind: 'unavailable', copy: 'Too many attempts. Wait a moment and try again.' },
  S008: { kind: 'refusal', copy: 'It was changed somewhere else first.' },
  S009: { kind: 'refusal', copy: 'That’s no longer available.' },
  S010: { kind: 'refusal', copy: 'You don’t have access to that.' },
  [NETWORK_ERROR_CODE]: { kind: 'unavailable', copy: 'Couldn’t reach Shadow Memoir.' },
};

export function commandErrorKind(code: string | null | undefined): CommandErrorKind | null {
  return code && Object.hasOwn(ERROR_CATALOGUE, code) ? (ERROR_CATALOGUE[code] as ErrorEntry).kind : null;
}

export function commandErrorCopy(code: string | null | undefined, fallback: string): string {
  return code && Object.hasOwn(ERROR_CATALOGUE, code) ? (ERROR_CATALOGUE[code] as ErrorEntry).copy : fallback;
}

/** Inverted on purpose: an unlisted code blocking the queue forever is worse than dropping a command whose failure was transient. */
export function isDeadLetterCode(code: string | null): boolean {
  return commandErrorKind(code) !== 'unavailable';
}

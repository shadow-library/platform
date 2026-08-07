/**
 * How the candidate values for one key — the platform default, an optional client-level value, and
 * every applicable organisation override — collapse into the single value the runtime uses.
 *
 * `MIN` is the strategy for every duration: an organisation may shorten a lifetime but never extend
 * one, so a stricter policy always wins no matter which organisation set it. `AND` is its analogue
 * for a switch — any applicable organisation turning a capability off turns it off for the meeting.
 */
export type PolicyResolution = 'MIN' | 'MAX' | 'AND' | 'OR' | 'OVERRIDE';

export interface PolicyDefinition {
  label: string;
  description: string;
  type: 'integer' | 'boolean';
  default: number | boolean;
  min?: number;
  max?: number;
  resolution: PolicyResolution;
}

export type PolicyKey = keyof typeof POLICY_REGISTRY;

type ValueOf<D> = D extends { type: 'boolean' } ? boolean : number;

export type PolicyValue<K extends PolicyKey> = ValueOf<(typeof POLICY_REGISTRY)[K]>;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const POLICY_REGISTRY = {
  'auth.access_token.ttl': {
    label: 'Access token lifetime',
    description: 'How long an application may keep using an access token before it has to renew it. A shorter lifetime narrows the window in which a stolen token still works.',
    type: 'integer',
    default: HOUR,
    min: MINUTE,
    max: DAY,
    resolution: 'MIN',
  },
  'auth.elevated_token.ttl': {
    label: 'Elevated access token lifetime',
    description: 'How long a token issued after a step-up check keeps the extra authority that unlocks sensitive actions. Once it lapses, the member has to pass step-up again.',
    type: 'integer',
    default: 10 * MINUTE,
    min: MINUTE,
    max: HOUR,
    resolution: 'MIN',
  },
  'auth.elevation.window': {
    label: 'Step-up reuse window',
    description: 'How long a completed step-up check can go on unlocking sensitive actions before the member is asked to repeat it.',
    type: 'integer',
    default: 10 * MINUTE,
    min: MINUTE,
    max: HOUR,
    resolution: 'MIN',
  },
  'auth.refresh_token.idle_ttl': {
    label: 'Refresh token idle timeout',
    description:
      'How long an application may sit idle before it loses the ability to renew a member’s access without a fresh sign-in. Each renewal restarts the clock, so only genuinely dormant applications are cut off.',
    type: 'integer',
    default: 15 * DAY,
    min: HOUR,
    max: 180 * DAY,
    resolution: 'MIN',
  },
  'auth.app_session.idle_ttl': {
    label: 'Sign-in idle timeout',
    description: 'How long a member can stay away from a Shadow application before they are signed out and have to sign in again.',
    type: 'integer',
    default: 30 * DAY,
    min: HOUR,
    max: 180 * DAY,
    resolution: 'MIN',
  },
  'auth.app_session.absolute_ttl': {
    label: 'Maximum sign-in length',
    description: 'How long a single sign-in may last before it ends regardless of activity, forcing the member to sign in again.',
    type: 'integer',
    default: 180 * DAY,
    min: DAY,
    max: 180 * DAY,
    resolution: 'MIN',
  },
  'mfa.email_otp_fallback.enabled': {
    label: 'Allow emailed one-time codes',
    description:
      'Whether a code sent to a member’s inbox counts as their second factor. Turning it off obliges them to use a stronger factor such as an authenticator app or a passkey.',
    type: 'boolean',
    default: true,
    resolution: 'AND',
  },
} as const satisfies Record<string, PolicyDefinition>;

export const POLICY_KEYS = Object.keys(POLICY_REGISTRY) as PolicyKey[];

export function isPolicyKey(value: string): value is PolicyKey {
  return Object.hasOwn(POLICY_REGISTRY, value);
}

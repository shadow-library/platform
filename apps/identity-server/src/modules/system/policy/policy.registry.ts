/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

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
  /** The setting's name, as a title beside its control. */
  label: string;
  /**
   * Rendered under the label; describes the effect, not the mechanism. A duration states what it governs
   * but never its unit — the editor lets an administrator pick one, so naming seconds here contradicts it.
   */
  description: string;
  type: 'integer' | 'boolean';
  default: number | boolean;
  /** Inclusive bounds for an `integer` policy. They also clamp the folded result, so no combination of overrides can escape them. */
  min?: number;
  max?: number;
  resolution: PolicyResolution;
}

export type PolicyKey = keyof typeof POLICY_REGISTRY;

type ValueOf<D> = D extends { type: 'boolean' } ? boolean : number;

/** The concrete value type a key carries, derived from its declared `type`. */
export type PolicyValue<K extends PolicyKey> = ValueOf<(typeof POLICY_REGISTRY)[K]>;

/**
 * Declaring the constants
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The catalogue of settings an organisation may override. A key must appear here to be readable or
 * writable: `PolicyService` refuses anything else, which is what keeps a generic key/value table from
 * degenerating into untyped, undocumented configuration.
 *
 * Adding a policy is a single entry here plus its read site — no migration, no DTO change.
 */
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
  /**
   * An emailed code sets the strength of AAL2 to control of the inbox, so an organisation must be
   * able to refuse it. `AND` mirrors `MIN` for booleans: any applicable organisation disabling the
   * fallback disables it for the meeting, so an organisation may tighten but never loosen.
   */
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

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
  /** Rendered by the admin console beside the input; describes the effect, not the mechanism. */
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
    description: 'Lifetime, in seconds, of an ordinary access token.',
    type: 'integer',
    default: HOUR,
    min: MINUTE,
    max: DAY,
    resolution: 'MIN',
  },
  'auth.elevated_token.ttl': {
    description: 'Lifetime, in seconds, of an access token carrying step-up (AAL2) authority.',
    type: 'integer',
    default: 10 * MINUTE,
    min: MINUTE,
    max: HOUR,
    resolution: 'MIN',
  },
  'auth.elevation.window': {
    description: 'How long, in seconds, a completed step-up remains usable for minting elevated tokens.',
    type: 'integer',
    default: 10 * MINUTE,
    min: MINUTE,
    max: HOUR,
    resolution: 'MIN',
  },
  'auth.refresh_token.idle_ttl': {
    description: 'How long, in seconds, a refresh token stays valid while unused. Refreshed on every rotation.',
    type: 'integer',
    default: 15 * DAY,
    min: HOUR,
    max: 180 * DAY,
    resolution: 'MIN',
  },
  'auth.app_session.idle_ttl': {
    description: 'How long, in seconds, a first-party application session survives without use.',
    type: 'integer',
    default: 30 * DAY,
    min: HOUR,
    max: 180 * DAY,
    resolution: 'MIN',
  },
  'auth.app_session.absolute_ttl': {
    description: 'Maximum lifetime, in seconds, of a first-party application session regardless of use.',
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
    description: 'Whether an emailed one-time code may serve as a second factor for this organisation’s members.',
    type: 'boolean',
    default: true,
    resolution: 'AND',
  },
} as const satisfies Record<string, PolicyDefinition>;

export const POLICY_KEYS = Object.keys(POLICY_REGISTRY) as PolicyKey[];

export function isPolicyKey(value: string): value is PolicyKey {
  return Object.hasOwn(POLICY_REGISTRY, value);
}

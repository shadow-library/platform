import { type IdentityProvider } from '@server/modules/infrastructure/datastore';

/**
 * `BUILT_IN` methods need nothing but a switch, and their state lives in `auth_mode_settings`.
 * `SOCIAL` methods need upstream credentials before they mean anything, so their state *is* the
 * global `identity_providers` row — keeping one source of truth per method rather than a flag that
 * can disagree with the configuration it gates.
 */
export interface AuthModeDefinition {
  label: string;
  description: string;
  kind: 'BUILT_IN' | 'SOCIAL';
  defaultEnabled: boolean;
  providerKind?: Exclude<IdentityProvider.Kind, 'OIDC'>;
}

export type AuthMode = keyof typeof AUTH_MODE_REGISTRY;

export const AUTH_MODE_REGISTRY = {
  PASSWORD: {
    label: 'Password',
    description: 'Members sign in with the password held on their account.',
    kind: 'BUILT_IN',
    defaultEnabled: true,
  },
  WEBAUTHN: {
    label: 'Passkeys',
    description: 'Members sign in with a device passkey or security key instead of a password.',
    kind: 'BUILT_IN',
    defaultEnabled: true,
  },
  EMAIL_OTP: {
    label: 'Emailed one-time code',
    description: 'Members can receive a single-use code at their verified email address in place of a password.',
    kind: 'BUILT_IN',
    defaultEnabled: true,
  },
  SMS_OTP: {
    label: 'Mobile number',
    description: 'Members can sign in with a verified mobile number and a single-use code sent by text message.',
    kind: 'BUILT_IN',
    defaultEnabled: false,
  },
  GOOGLE: {
    label: 'Google',
    description: 'Members sign in with a Google account. Needs an OAuth client from the Google Cloud console.',
    kind: 'SOCIAL',
    defaultEnabled: false,
    providerKind: 'GOOGLE',
  },
  MICROSOFT: {
    label: 'Microsoft',
    description: 'Members sign in with a Microsoft work or school account. Needs an app registration in a single Entra tenant.',
    kind: 'SOCIAL',
    defaultEnabled: false,
    providerKind: 'MICROSOFT',
  },
  APPLE: {
    label: 'Apple',
    description: 'Members sign in with Sign in with Apple. Needs a Services ID and a .p8 client-secret key from the Apple Developer portal.',
    kind: 'SOCIAL',
    defaultEnabled: false,
    providerKind: 'APPLE',
  },
} as const satisfies Record<string, AuthModeDefinition>;

export const AUTH_MODES = Object.keys(AUTH_MODE_REGISTRY) as AuthMode[];

export const SOCIAL_AUTH_MODES = AUTH_MODES.filter(mode => AUTH_MODE_REGISTRY[mode].kind === 'SOCIAL');

export function isAuthMode(value: string): value is AuthMode {
  return Object.hasOwn(AUTH_MODE_REGISTRY, value);
}

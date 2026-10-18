export const APP_NAME = 'synapse';

export const OPENROUTER_ORIGIN = 'https://openrouter.ai';

/** The only Config keys a catalog provider may name as the deprecated `apiKeyConfig`; `bootstrap.ts` loads exactly these, for one release */
export const PROVIDER_CREDENTIAL_KEYS = ['synapse.provider.openrouter.api-key'] as const;

/** Binds each deprecated key to one origin, as a stored credential is bound, so a catalog edit cannot send it elsewhere */
export const PROVIDER_CREDENTIAL_ORIGINS: Readonly<Record<(typeof PROVIDER_CREDENTIAL_KEYS)[number], string>> = {
  'synapse.provider.openrouter.api-key': OPENROUTER_ORIGIN,
};

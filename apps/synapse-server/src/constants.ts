export const APP_NAME = 'synapse';

/** The only Config keys a catalog provider may name as `apiKeyConfig`; `bootstrap.ts` loads exactly these */
export const PROVIDER_CREDENTIAL_KEYS = ['synapse.provider.openrouter.api-key'] as const;

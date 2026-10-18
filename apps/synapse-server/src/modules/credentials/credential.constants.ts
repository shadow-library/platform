import { InjectionToken } from '@shadow-library/app';
import { type Keyring, type SecretBox } from '@shadow-library/common/crypto';

import { OPENROUTER_ORIGIN } from '@server/constants';

import { type CatalogTimers } from '@modules/catalog/active-catalog.cache';
import { type ProviderFetch } from '@modules/providers/provider.types';

export const CREDENTIAL_KEYRING = new InjectionToken<Keyring>('CREDENTIAL_KEYRING');
export const CREDENTIAL_BOX = new InjectionToken<SecretBox>('CREDENTIAL_BOX');
export const CREDENTIAL_TIMERS = new InjectionToken<CatalogTimers>('CREDENTIAL_TIMERS');
export const CREDENTIAL_FETCH = new InjectionToken<ProviderFetch>('CREDENTIAL_FETCH');

export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 4096;
export const CREDENTIAL_NAME_PATTERN = '^[a-z0-9][a-z0-9._-]{0,63}$';

export const IMPORT_ACTOR = 'import';
export const IMPORTED_OPENROUTER = { name: 'openrouter', allowedOrigin: OPENROUTER_ORIGIN } as const;

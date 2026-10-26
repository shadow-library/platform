import { type ReactElement } from 'react';
import { Badge, Button, Select } from '@shadow-library/ui';

import { credentialsForUrl, hintLabel, isRevoked, originHost, originOfUrl } from '@/features/credentials/credential-view';
import { Mono, Muted } from '@/features/shared';
import { type CredentialResponse } from '@/lib';

import { legacyKeyLabel, type ProviderKeyStatus } from './provider-view';
import styles from './Providers.module.css';

export type CredentialList = { status: 'not_allowed' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: readonly CredentialResponse[] };

export function credentialListOf(allowed: boolean, query: { data?: { items: CredentialResponse[] }; error: Error | null }): CredentialList {
  if (!allowed) return { status: 'not_allowed' };
  if (query.data) return { status: 'ready', items: query.data.items };
  return query.error ? { status: 'error', message: query.error.message } : { status: 'loading' };
}

export function listedCredentials(list: CredentialList): readonly CredentialResponse[] | undefined {
  return list.status === 'ready' ? list.items : undefined;
}

export function unlistedReason(list: Exclude<CredentialList, { status: 'ready' }>): string {
  switch (list.status) {
    case 'not_allowed':
      return "Your role can't list stored keys, so it can't be changed here.";
    case 'loading':
      return 'Loading the stored keys…';
    case 'error':
      return `Couldn't load the stored keys, so it can't be changed right now: ${list.message}`;
  }
}

export function KeyStatusText({ status }: { status: ProviderKeyStatus }): ReactElement {
  switch (status.kind) {
    case 'not_needed':
      return <Muted>Not needed</Muted>;
    case 'none':
      return <Muted>No key</Muted>;
    case 'legacy_setting':
      return <>{legacyKeyLabel(false)}</>;
    case 'configured':
      return <>Set in the old environment key setting</>;
    case 'missing':
      return (
        <Badge intent="danger" variant="soft">
          The old environment key setting is empty
        </Badge>
      );
    case 'credential':
      return status.name ? <>{status.name}</> : <>Stored key</>;
    case 'credential_revoked':
      return (
        <Badge intent="danger" variant="soft">
          {status.name} is revoked
        </Badge>
      );
    case 'credential_unknown':
      return (
        <Badge intent="danger" variant="soft">
          Stored key not found
        </Badge>
      );
  }
}

export interface CredentialPickerProps {
  ownerName: string;
  url: string;
  value: string;
  apiKeyConfig?: string;
  credentials: readonly CredentialResponse[];
  disabled?: boolean;
  onChange: (credentialId: string | null) => void;
}

function placeholderOf(url: string, choices: number, legacy: boolean): string {
  if (originOfUrl(url) === null) return 'Set a valid address first';
  if (choices === 0) return 'No stored key for this address';
  return legacy ? 'Switch to a stored key' : 'Choose a stored key';
}

export function LegacyKeyBadge({ apiKeyConfig, alongside }: { apiKeyConfig: string; alongside: boolean }): ReactElement {
  return (
    <span className={styles.stack}>
      <span>
        <Badge intent="warning" variant="soft">
          {legacyKeyLabel(alongside)}
        </Badge>
      </span>
      <details className={styles.details}>
        <summary>Technical details</summary>
        Environment setting <Mono>{apiKeyConfig}</Mono>
      </details>
    </span>
  );
}

export function CredentialPicker({ ownerName, url, value, apiKeyConfig, credentials, disabled, onChange }: CredentialPickerProps): ReactElement {
  const options = credentialsForUrl(credentials, url);
  const known = value === '' ? undefined : credentials.find(credential => credential.id === value);
  const orphan = value !== '' && !options.some(option => option.id === value) ? value : undefined;
  const usable = originOfUrl(url) !== null;

  return (
    <span className={styles.picker}>
      {apiKeyConfig ? <LegacyKeyBadge apiKeyConfig={apiKeyConfig} alongside={value !== ''} /> : null}
      <span className={styles.pickerRow}>
        <Select
          className={styles.pickerSelect}
          size="sm"
          value={value}
          onValueChange={onChange}
          disabled={disabled || !usable || (options.length === 0 && orphan === undefined)}
          placeholder={placeholderOf(url, options.length, apiKeyConfig !== undefined && apiKeyConfig !== '')}
          aria-label={`API key for ${ownerName}`}
        >
          {orphan !== undefined ? (
            <Select.Item value={orphan} description={known ? `Only sent to ${originHost(known.allowedOrigin)}` : orphan}>
              {known ? `${known.name}${isRevoked(known) ? ' (revoked)' : ''}` : 'Unknown key'}
            </Select.Item>
          ) : null}
          {options.map(option => (
            <Select.Item key={option.id} value={option.id} description={hintLabel(option.hint)}>
              {option.name}
            </Select.Item>
          ))}
        </Select>
        {value !== '' && !disabled ? (
          <Button variant="ghost" size="sm" aria-label={`Remove the API key of ${ownerName}`} onClick={() => onChange(null)}>
            Clear
          </Button>
        ) : null}
      </span>
    </span>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Badge, Button, Select, Table, type TableColumn } from '@shadow-library/ui';

import { credentialsForUrl, hintLabel, isRevoked, issueAdvice, originOfUrl } from '@/features/credentials/credential-view';
import { Mono, Muted, SectionHeader } from '@/features/shared';
import cells from '@/features/shared/cells.module.css';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogIssueResponse, type CredentialResponse, credentialsQueryOptions } from '@/lib';

import {
  type CatalogDocument,
  credentialIssuesByProvider,
  type DocumentEdit,
  type ParsedCatalog,
  type ProviderEntry,
  readProviders,
  withoutProviderCredential,
  withProviderCredential,
} from './catalog-document';
import styles from './Catalog.module.css';

interface ProviderCredentialsPanelProps {
  capabilities: Capabilities;
  parsed: ParsedCatalog;
  issues: readonly CatalogIssueResponse[];
  onDocumentChange: (document: CatalogDocument) => void;
}

interface PickerProps {
  provider: ProviderEntry;
  credentials: readonly CredentialResponse[] | undefined;
  editable: boolean;
  onPick: (credentialId: string) => void;
  onClear: () => void;
}

function pickerPlaceholder(provider: ProviderEntry, bound: number): string {
  if (originOfUrl(provider.url) === null) return 'Set a valid URL first';
  if (bound === 0) return 'No credential for this origin';
  return provider.apiKeyConfig ? 'Switch to a stored credential' : 'Choose a credential';
}

function CredentialPicker({ provider, credentials, editable, onPick, onClear }: PickerProps): ReactElement {
  const current = provider.credential;
  const deprecated = provider.apiKeyConfig ? (
    <span className={styles.deprecated}>
      <Mono>{provider.apiKeyConfig}</Mono>
      <Badge intent="warning" variant="soft">
        {current ? 'Also set' : 'Deprecated'}
      </Badge>
    </span>
  ) : null;

  if (credentials === undefined)
    return (
      <span className={styles.picker}>
        {current ? <Mono>{current}</Mono> : (deprecated ?? <Muted>None</Muted>)}
        {current ? deprecated : null}
      </span>
    );

  const options = credentialsForUrl(credentials, provider.url);
  const known = current === undefined ? undefined : credentials.find(credential => credential.id === current);
  const orphan = current !== undefined && !options.some(option => option.id === current) ? current : undefined;
  const urlUsable = originOfUrl(provider.url) !== null;

  return (
    <span className={styles.picker}>
      {deprecated}
      <span className={styles.pickerRow}>
        <Select
          className={styles.pickerSelect}
          size="sm"
          value={current ?? ''}
          onValueChange={onPick}
          disabled={!editable || !urlUsable || (options.length === 0 && orphan === undefined)}
          placeholder={pickerPlaceholder(provider, options.length)}
          aria-label={`Credential for ${provider.key}`}
        >
          {orphan !== undefined ? (
            <Select.Item value={orphan} description={known ? known.allowedOrigin : orphan}>
              {known ? `${known.name}${isRevoked(known) ? ' (revoked)' : ''}` : 'Unknown credential'}
            </Select.Item>
          ) : null}
          {options.map(option => (
            <Select.Item key={option.id} value={option.id} description={hintLabel(option.hint)}>
              {option.name}
            </Select.Item>
          ))}
        </Select>
        {current && editable ? (
          <Button variant="ghost" size="sm" aria-label={`Remove the credential of ${provider.key}`} onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </span>
    </span>
  );
}

export function ProviderCredentialsPanel({ capabilities, parsed, issues, onDocumentChange }: ProviderCredentialsPanelProps): ReactElement | null {
  const credentials = useQuery({ ...credentialsQueryOptions(), enabled: capabilities.manageCredentials });
  const providers = parsed.ok ? readProviders(parsed.document) : [];
  const issuesByProvider = credentialIssuesByProvider(issues);
  const editable = parsed.ok && capabilities.writeDraft && capabilities.writeProviders;
  const listed = capabilities.manageCredentials ? credentials.data?.items : undefined;

  if (!parsed.ok || providers.length === 0) return null;

  const apply = (edit: (document: CatalogDocument) => DocumentEdit): void => {
    const result = edit(parsed.document);
    if (result.ok) onDocumentChange(result.document);
  };

  const columns: TableColumn<ProviderEntry>[] = [
    {
      id: 'provider',
      header: 'Provider',
      cell: row => (
        <span>
          <Mono>{row.key}</Mono>
          <div className={cells.url}>{row.url || 'No URL'}</div>
        </span>
      ),
    },
    {
      id: 'credential',
      header: 'Credential',
      cell: row =>
        row.kind === 'ollama' ? (
          <Muted>not needed</Muted>
        ) : (
          <CredentialPicker
            provider={row}
            credentials={listed}
            editable={editable}
            onPick={id => apply(document => withProviderCredential(document, row.key, id))}
            onClear={() => apply(document => withoutProviderCredential(document, row.key))}
          />
        ),
    },
    {
      id: 'issues',
      header: 'Problems',
      cell: row => {
        const found = issuesByProvider.get(row.key) ?? [];
        if (found.length === 0) return <Muted>—</Muted>;
        return (
          <span>
            {found.map(issue => (
              <span key={`${issue.path}:${issue.code}`} className={styles.providerIssue}>
                <span className={styles.providerIssueMessage}>{issue.message}</span>
                <span className={styles.providerIssueAdvice}>{issueAdvice(issue.code)}</span>
              </span>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <section className={styles.providers} aria-label="Provider credentials">
      <SectionHeader
        title="Provider credentials"
        subtitle="A provider names a stored credential instead of a key. Picking one edits the draft above; it takes effect once the draft is saved and published."
        action={capabilities.manageCredentials ? <Link to="/credentials">Manage credentials</Link> : undefined}
      />
      <Table data={providers} columns={columns} rowKey="key" aria-label="Credential of each provider in the draft" />
      {capabilities.manageCredentials ? null : (
        <p className={controls.hint}>Your role cannot list stored credentials, so only the ones already named are shown and none can be picked.</p>
      )}
      {capabilities.manageCredentials && credentials.error ? <p className={controls.hint}>Couldn&apos;t load the stored credentials: {credentials.error.message}</p> : null}
    </section>
  );
}

/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Alert, Breadcrumbs, Button, Card, DescriptionList, Select, Spinner, Table, type TableColumn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import {
  ACTIVE_FILTER_OPTIONS,
  ALL,
  CHANNEL_FILTER_OPTIONS,
  formatDateTime,
  FormDrawer,
  type FormValue,
  type FormValues,
  Mono,
  OutlineBadge,
  PageHeader,
  PROVIDER_FILTER_OPTIONS,
  SectionHeader,
  StatusBadge,
  trimToUndefined,
  useConfirm,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type NotificationChannel,
  type NotificationServiceProvider,
  type SenderEndpointResponse,
  useCreateSenderEndpointMutation,
  useDeleteSenderEndpointMutation,
  useListSenderEndpointsQuery,
  useSenderProfileQuery,
  useUpdateSenderEndpointMutation,
  useUpdateSenderProfileMutation,
} from '@/lib';

import { endpointFormConfig, senderFormConfig } from './forms';

function toWeight(value: FormValue): number | undefined {
  const text = String(value ?? '').trim();
  if (text === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ProfileDetail({ profileId }: { profileId: string }): ReactElement {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: profile, isLoading, error } = useSenderProfileQuery(profileId);
  const { data: endpointsData } = useListSenderEndpointsQuery(profileId, { limit: 100 });
  const endpoints = useMemo(() => endpointsData?.items ?? [], [endpointsData]);

  const [channel, setChannel] = useState<string>(ALL);
  const [provider, setProvider] = useState<string>(ALL);
  const [active, setActive] = useState<string>(ALL);
  const filtered = endpoints.filter(
    endpoint =>
      (channel === ALL || endpoint.channel === channel) && (provider === ALL || endpoint.provider === provider) && (active === ALL || String(endpoint.isActive) === active),
  );

  const [formKind, setFormKind] = useState<'profile' | 'endpoint' | null>(null);
  const [endpointRow, setEndpointRow] = useState<SenderEndpointResponse | null>(null);
  const profileUpdate = useUpdateSenderProfileMutation(profileId);
  const endpointCreate = useCreateSenderEndpointMutation(profileId);
  const endpointUpdate = useUpdateSenderEndpointMutation(profileId, endpointRow?.id ?? '');

  const [deleting, setDeleting] = useState<SenderEndpointResponse | null>(null);
  const endpointDelete = useDeleteSenderEndpointMutation(profileId, deleting?.id ?? '');
  useEffect(() => {
    if (!deleting) return;
    endpointDelete.mutate(undefined, { onSettled: () => setDeleting(null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting]);

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load sender profile">
        {error.message}
      </Alert>
    );
  if (isLoading || !profile)
    return (
      <div className={controls.loading}>
        <Spinner />
      </div>
    );

  const config = formKind === 'profile' ? senderFormConfig(profile) : endpointFormConfig(endpointRow);
  const closeForm = (): void => setFormKind(null);

  const submitForm = (values: FormValues): void => {
    if (formKind === 'profile') {
      profileUpdate.mutate({ displayName: trimToUndefined(values.displayName), isActive: values.isActive !== false }, { onSuccess: closeForm });
    } else if (endpointRow) {
      endpointUpdate.mutate({ identifier: String(values.identifier ?? '').trim(), weight: toWeight(values.weight), isActive: values.isActive !== false }, { onSuccess: closeForm });
    } else {
      endpointCreate.mutate(
        {
          channel: values.channel as NotificationChannel,
          provider: values.provider as NotificationServiceProvider,
          identifier: String(values.identifier ?? '').trim(),
          weight: toWeight(values.weight),
          isActive: values.isActive !== false,
        },
        { onSuccess: closeForm },
      );
    }
  };

  const requestDelete = async (row: SenderEndpointResponse): Promise<void> => {
    if (await confirm({ title: 'Delete endpoint?', description: `The ${row.channel} / ${row.provider} endpoint will be permanently removed.` })) setDeleting(row);
  };

  const columns: TableColumn<SenderEndpointResponse>[] = [
    { id: 'channel', header: 'Channel', cell: row => <OutlineBadge>{row.channel}</OutlineBadge> },
    { id: 'provider', header: 'Provider', cell: row => <OutlineBadge>{row.provider}</OutlineBadge> },
    { id: 'identifier', header: 'Identifier', cell: row => <Mono>{row.identifier}</Mono> },
    { id: 'weight', header: 'Weight', align: 'end', cell: row => <span className={controls.tabular}>{row.weight}</span> },
    { id: 'isActive', header: 'Status', cell: row => <StatusBadge active={row.isActive} /> },
    {
      id: '_actions',
      header: '',
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEndpointRow(row);
              setFormKind('endpoint');
            }}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" className={controls.danger} onClick={() => void requestDelete(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumbs>
            <Breadcrumbs.Item
              href="/senders"
              onClick={event => {
                event.preventDefault();
                navigate({ to: '/senders' });
              }}
            >
              Sender Profiles
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{profile.key}</Breadcrumbs.Item>
          </Breadcrumbs>
        }
        title={profile.key}
        mono
        subtitle={profile.displayName || '—'}
        action={
          <Button variant="secondary" onClick={() => setFormKind('profile')}>
            Edit profile
          </Button>
        }
      />

      <Card padding="md" className={controls.detailCard}>
        <DescriptionList layout="grid" columns={4}>
          <DescriptionList.Item term="Status">
            <StatusBadge active={profile.isActive} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Display name">{profile.displayName || '—'}</DescriptionList.Item>
          <DescriptionList.Item term="Created">{formatDateTime(profile.createdAt)}</DescriptionList.Item>
          <DescriptionList.Item term="Updated">{formatDateTime(profile.updatedAt)}</DescriptionList.Item>
        </DescriptionList>
      </Card>

      <SectionHeader
        title="Endpoints"
        subtitle="Provider credentials and weights for each channel."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setEndpointRow(null);
              setFormKind('endpoint');
            }}
          >
            New endpoint
          </Button>
        }
      />
      <div className={controls.toolbar}>
        <Select className={controls.filterSm} value={channel} onValueChange={setChannel} aria-label="Filter by channel">
          {CHANNEL_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
        <Select className={controls.filter} value={provider} onValueChange={setProvider} aria-label="Filter by provider">
          {PROVIDER_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
        <Select className={controls.filterSm} value={active} onValueChange={setActive} aria-label="Filter by status">
          {ACTIVE_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      </div>
      <Table data={filtered} columns={columns} rowKey="id" aria-label="Endpoints" emptyState="No endpoints match these filters." />

      <FormDrawer
        open={formKind !== null}
        onOpenChange={open => !open && closeForm()}
        title={config.title}
        meta={config.meta}
        submitLabel={config.submitLabel}
        fields={config.fields}
        initialValues={config.initialValues}
        loading={profileUpdate.isPending || endpointCreate.isPending || endpointUpdate.isPending}
        onSubmit={submitForm}
      />
    </>
  );
}

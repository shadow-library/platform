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
  ALL,
  CHANNEL_FILTER_OPTIONS,
  formatDateTime,
  FormDrawer,
  type FormValues,
  Mono,
  OutlineBadge,
  PageHeader,
  PriorityBadge,
  SectionHeader,
  StatusBadge,
  TextOrDash,
  trimToUndefined,
  useConfirm,
  type ViewerData,
  ViewerDrawer,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type MessageType,
  type NotificationChannel,
  type Priority,
  type TemplateVariantResponse,
  useCreateTemplateVariantMutation,
  useDeleteTemplateVariantMutation,
  useListTemplateVariantsQuery,
  useTemplateGroupQuery,
  useUpdateTemplateGroupMutation,
  useUpdateTemplateVariantMutation,
} from '@/lib';

import { groupFormConfig, variantFormConfig } from './forms';
import styles from './Templates.module.css';

export default function GroupDetail({ groupId }: { groupId: string }): ReactElement {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: group, isLoading, error } = useTemplateGroupQuery(groupId);
  const { data: variantsData } = useListTemplateVariantsQuery(groupId, { limit: 100 });
  const variants = useMemo(() => variantsData?.items ?? [], [variantsData]);

  const [channel, setChannel] = useState<string>(ALL);
  const [locale, setLocale] = useState<string>(ALL);
  const localeOptions = useMemo(() => {
    const locales = Array.from(new Set(variants.map(variant => variant.locale)));
    return [{ value: ALL, label: 'All locales' }, ...locales.map(value => ({ value, label: value }))];
  }, [variants]);
  const filtered = variants.filter(variant => (channel === ALL || variant.channel === channel) && (locale === ALL || variant.locale === locale));

  const [formKind, setFormKind] = useState<'group' | 'variant' | null>(null);
  const [variantRow, setVariantRow] = useState<TemplateVariantResponse | null>(null);
  const groupUpdate = useUpdateTemplateGroupMutation(groupId);
  const variantCreate = useCreateTemplateVariantMutation(groupId);
  const variantUpdate = useUpdateTemplateVariantMutation(groupId, variantRow?.id ?? '');

  const [deleting, setDeleting] = useState<TemplateVariantResponse | null>(null);
  const variantDelete = useDeleteTemplateVariantMutation(groupId, deleting?.id ?? '');
  useEffect(() => {
    if (!deleting) return;
    variantDelete.mutate(undefined, { onSettled: () => setDeleting(null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting]);

  const [viewer, setViewer] = useState<ViewerData | null>(null);
  const openView = (row: TemplateVariantResponse): void =>
    setViewer({ channel: row.channel, title: `${row.channel} · ${row.locale}`, meta: 'Template preview', subject: row.subject, body: row.body, rawBody: row.body, payload: null });

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load template group">
        {error.message}
      </Alert>
    );
  if (isLoading || !group)
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );

  const config = formKind === 'group' ? groupFormConfig(group) : variantFormConfig(variantRow);
  const closeForm = (): void => setFormKind(null);

  const submitForm = (values: FormValues): void => {
    if (formKind === 'group') {
      const priority = values.priority === 'NONE' ? undefined : (values.priority as Priority | undefined);
      groupUpdate.mutate(
        { messageType: values.messageType as MessageType, description: trimToUndefined(values.description), priority, isActive: values.isActive !== false },
        { onSuccess: closeForm },
      );
    } else if (variantRow) {
      variantUpdate.mutate({ subject: trimToUndefined(values.subject), body: String(values.body ?? ''), isActive: values.isActive !== false }, { onSuccess: closeForm });
    } else {
      variantCreate.mutate(
        {
          channel: values.channel as NotificationChannel,
          locale: String(values.locale ?? '').trim(),
          subject: trimToUndefined(values.subject),
          body: String(values.body ?? ''),
          isActive: values.isActive !== false,
        },
        { onSuccess: closeForm },
      );
    }
  };

  const requestDelete = async (row: TemplateVariantResponse): Promise<void> => {
    if (await confirm({ title: 'Delete variant?', description: `The ${row.channel} / ${row.locale} variant will be permanently removed.` })) setDeleting(row);
  };

  const columns: TableColumn<TemplateVariantResponse>[] = [
    { id: 'channel', header: 'Channel', cell: row => <OutlineBadge>{row.channel}</OutlineBadge> },
    { id: 'locale', header: 'Locale', cell: row => <Mono>{row.locale}</Mono> },
    { id: 'subject', header: 'Subject', cell: row => <TextOrDash value={row.subject} /> },
    { id: 'body', header: 'Body', cell: row => <span className={styles.bodyPreview}>{row.body.replace(/\n/g, ' ')}</span> },
    { id: 'isActive', header: 'Status', cell: row => <StatusBadge active={row.isActive} /> },
    {
      id: '_actions',
      header: '',
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          <Button variant="ghost" size="sm" onClick={() => openView(row)}>
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setVariantRow(row);
              setFormKind('variant');
            }}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" className={styles.danger} onClick={() => requestDelete(row)}>
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
              href="/templates"
              onClick={event => {
                event.preventDefault();
                navigate({ to: '/templates' });
              }}
            >
              Template Groups
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{group.templateKey}</Breadcrumbs.Item>
          </Breadcrumbs>
        }
        title={group.templateKey}
        mono
        subtitle={group.description || '—'}
        action={
          <Button variant="secondary" onClick={() => setFormKind('group')}>
            Edit group
          </Button>
        }
      />

      <Card padding="md" className={controls.detailCard}>
        <DescriptionList layout="grid" columns={4}>
          <DescriptionList.Item term="Message type">
            <OutlineBadge>{group.messageType}</OutlineBadge>
          </DescriptionList.Item>
          <DescriptionList.Item term="Priority">
            <PriorityBadge priority={group.priority} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Status">
            <StatusBadge active={!!group.isActive} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Created">{formatDateTime(group.createdAt)}</DescriptionList.Item>
          <DescriptionList.Item term="Updated">{formatDateTime(group.updatedAt)}</DescriptionList.Item>
        </DescriptionList>
      </Card>

      <SectionHeader
        title="Variants"
        subtitle="Renderable content per channel + locale."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setVariantRow(null);
              setFormKind('variant');
            }}
          >
            New variant
          </Button>
        }
      />
      <div className={controls.toolbar}>
        <Select className={controls.filter} value={channel} onValueChange={setChannel} aria-label="Filter by channel">
          {CHANNEL_FILTER_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
        <Select className={controls.filter} value={locale} onValueChange={setLocale} aria-label="Filter by locale">
          {localeOptions.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      </div>
      <Table data={filtered} columns={columns} rowKey="id" aria-label="Variants" onRowClick={openView} emptyState="No variants match these filters." />

      <FormDrawer
        open={formKind !== null}
        onOpenChange={open => !open && closeForm()}
        title={config.title}
        meta={config.meta}
        submitLabel={config.submitLabel}
        fields={config.fields}
        initialValues={config.initialValues}
        loading={groupUpdate.isPending || variantCreate.isPending || variantUpdate.isPending}
        onSubmit={submitForm}
      />
      <ViewerDrawer open={!!viewer} data={viewer} onOpenChange={open => !open && setViewer(null)} />
    </>
  );
}

/**
 * Importing npm packages
 */
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Breadcrumbs, Button, Card, DescriptionList, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { formatDateTime, FormDrawer, type FormValues, PageHeader, StatusBadge, TextOrDash, trimToUndefined } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { usePartialQuery, usePublishPartialMutation, useUpdatePartialMutation, useUpsertPartialDraftMutation } from '@/lib';

import DesignEditor from './DesignEditor';
import { partialFormConfig } from './forms';

export default function PartialDetail({ partialId }: { partialId: string }): ReactElement {
  const navigate = useNavigate();
  const { data: partial, isLoading, error } = usePartialQuery(partialId);
  const updateMutation = useUpdatePartialMutation(partialId);
  const draftMutation = useUpsertPartialDraftMutation(partialId);
  const publishMutation = usePublishPartialMutation(partialId);
  const [editOpen, setEditOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [publishError, setPublishError] = useState('');

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load partial">
        {error.message}
      </Alert>
    );
  if (isLoading || !partial)
    return (
      <div className={controls.loading}>
        <Spinner />
      </div>
    );

  const config = partialFormConfig(partial);
  const current = partial.versions.find(version => version.status === 'DRAFT') ?? partial.versions.find(version => version.status === 'PUBLISHED') ?? partial.versions[0];

  const submit = (values: FormValues): void => {
    updateMutation.mutate(
      { name: String(values.name ?? '').trim(), description: trimToUndefined(values.description), isActive: values.isActive !== false },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const saveDraft = (body: string, notes?: string): void => {
    setSaveError('');
    draftMutation.mutate({ body, notes }, { onError: apiError => setSaveError(apiError.message) });
  };

  const publish = (notes?: string): void => {
    setPublishError('');
    publishMutation.mutate({ notes }, { onError: apiError => setPublishError(apiError.message) });
  };

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumbs>
            <Breadcrumbs.Item
              href="/design/partials"
              onClick={event => {
                event.preventDefault();
                navigate({ to: '/design/partials' });
              }}
            >
              Partials
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{partial.partialKey}</Breadcrumbs.Item>
          </Breadcrumbs>
        }
        title={partial.partialKey}
        mono
        subtitle={partial.name}
        action={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Edit partial
          </Button>
        }
      />

      <Card padding="md" className={controls.detailCard}>
        <DescriptionList layout="grid" columns={4}>
          <DescriptionList.Item term="Name">{partial.name}</DescriptionList.Item>
          <DescriptionList.Item term="Description">
            <TextOrDash value={partial.description} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Status">
            <StatusBadge active={partial.isActive} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Updated">{formatDateTime(partial.updatedAt)}</DescriptionList.Item>
        </DescriptionList>
      </Card>

      <DesignEditor
        defaultBody={current?.body ?? ''}
        versions={partial.versions}
        saving={draftMutation.isPending}
        publishing={publishMutation.isPending}
        saveError={saveError || undefined}
        publishError={publishError || undefined}
        onSaveDraft={saveDraft}
        onPublish={publish}
      />

      <FormDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        title={config.title}
        meta={config.meta}
        submitLabel={config.submitLabel}
        fields={config.fields}
        initialValues={config.initialValues}
        loading={updateMutation.isPending}
        onSubmit={submit}
      />
    </>
  );
}

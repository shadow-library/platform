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
import { useLayoutQuery, usePublishLayoutMutation, useUpdateLayoutMutation, useUpsertLayoutDraftMutation } from '@/lib';

import DesignEditor from './DesignEditor';
import { layoutFormConfig } from './forms';

export default function LayoutDetail({ layoutId }: { layoutId: string }): ReactElement {
  const navigate = useNavigate();
  const { data: layout, isLoading, error } = useLayoutQuery(layoutId);
  const updateMutation = useUpdateLayoutMutation(layoutId);
  const draftMutation = useUpsertLayoutDraftMutation(layoutId);
  const publishMutation = usePublishLayoutMutation(layoutId);
  const [editOpen, setEditOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [publishError, setPublishError] = useState('');

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load layout">
        {error.message}
      </Alert>
    );
  if (isLoading || !layout)
    return (
      <div className={controls.loading}>
        <Spinner />
      </div>
    );

  const config = layoutFormConfig(layout);
  const current = layout.versions.find(version => version.status === 'DRAFT') ?? layout.versions.find(version => version.status === 'PUBLISHED') ?? layout.versions[0];

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
              href="/design/layouts"
              onClick={event => {
                event.preventDefault();
                navigate({ to: '/design/layouts' });
              }}
            >
              Layouts
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{layout.layoutKey}</Breadcrumbs.Item>
          </Breadcrumbs>
        }
        title={layout.layoutKey}
        mono
        subtitle={layout.name}
        action={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Edit layout
          </Button>
        }
      />

      <Card padding="md" className={controls.detailCard}>
        <Card.Body>
          <DescriptionList layout="grid" columns={4}>
            <DescriptionList.Item term="Name">{layout.name}</DescriptionList.Item>
            <DescriptionList.Item term="Description">
              <TextOrDash value={layout.description} />
            </DescriptionList.Item>
            <DescriptionList.Item term="Status">
              <StatusBadge active={layout.isActive} />
            </DescriptionList.Item>
            <DescriptionList.Item term="Updated">{formatDateTime(layout.updatedAt)}</DescriptionList.Item>
          </DescriptionList>
        </Card.Body>
      </Card>

      <DesignEditor
        defaultBody={current?.body ?? ''}
        versions={layout.versions}
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

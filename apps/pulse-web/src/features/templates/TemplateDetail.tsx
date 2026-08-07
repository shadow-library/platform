import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Breadcrumbs, Button, Card, DescriptionList, Spinner } from '@shadow-library/ui';

import { formatDateTime, FormDrawer, type FormValues, OutlineBadge, PageHeader, PriorityBadge, StatusBadge, TextOrDash, trimToUndefined } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type MessageType, type Priority, useListVersionsQuery, useTemplateQuery, useUpdateTemplateMutation } from '@/lib';

import ChannelSettings from './ChannelSettings';
import DraftEditor from './DraftEditor';
import { templateFormConfig } from './forms';
import styles from './Templates.module.css';
import VariableSchemaEditor from './VariableSchemaEditor';
import VersionHistory from './VersionHistory';

export default function TemplateDetail({ templateId }: { templateId: string }): ReactElement {
  const navigate = useNavigate();
  const { data: template, isLoading, error } = useTemplateQuery(templateId);
  const { data: versionsData } = useListVersionsQuery(templateId);
  const updateMutation = useUpdateTemplateMutation(templateId);
  const [editOpen, setEditOpen] = useState(false);

  const versions = useMemo(() => versionsData?.items ?? [], [versionsData]);
  const enabledChannels = useMemo(() => template?.channels.filter(setting => setting.isEnabled).map(setting => setting.channel) ?? [], [template]);

  if (error)
    return (
      <Alert intent="danger" title="Couldn't load template">
        {error.message}
      </Alert>
    );
  if (isLoading || !template)
    return (
      <div className={controls.loading}>
        <Spinner />
      </div>
    );

  const config = templateFormConfig(template);

  const submit = (values: FormValues): void => {
    updateMutation.mutate(
      {
        name: String(values.name ?? '').trim(),
        messageType: values.messageType as MessageType,
        priority: values.priority as Priority,
        category: trimToUndefined(values.category),
        description: trimToUndefined(values.description),
        isActive: values.isActive !== false,
      },
      { onSuccess: () => setEditOpen(false) },
    );
  };

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
              Templates
            </Breadcrumbs.Item>
            <Breadcrumbs.Item current>{template.templateKey}</Breadcrumbs.Item>
          </Breadcrumbs>
        }
        title={template.templateKey}
        mono
        subtitle={template.name}
        action={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Edit template
          </Button>
        }
      />

      <Card padding="md" className={controls.detailCard}>
        <Card.Body>
          <DescriptionList layout="grid" columns={4}>
            <DescriptionList.Item term="Name">{template.name}</DescriptionList.Item>
            <DescriptionList.Item term="Message type">
              <OutlineBadge>{template.messageType}</OutlineBadge>
            </DescriptionList.Item>
            <DescriptionList.Item term="Priority">
              <PriorityBadge priority={template.priority} />
            </DescriptionList.Item>
            <DescriptionList.Item term="Category">
              <TextOrDash value={template.category} />
            </DescriptionList.Item>
            <DescriptionList.Item term="Status">
              <StatusBadge active={template.isActive} />
            </DescriptionList.Item>
            <DescriptionList.Item term="Created">{formatDateTime(template.createdAt)}</DescriptionList.Item>
            <DescriptionList.Item term="Updated">{formatDateTime(template.updatedAt)}</DescriptionList.Item>
          </DescriptionList>
        </Card.Body>
      </Card>

      <ChannelSettings templateId={templateId} channels={template.channels} />

      <div className={styles.sectionGap}>
        <VariableSchemaEditor templateId={templateId} schema={template.variableSchema} />
      </div>

      <div className={styles.sectionGap}>
        <DraftEditor templateId={templateId} versions={versions} channels={enabledChannels} />
      </div>

      <div className={styles.sectionGap}>
        <VersionHistory templateId={templateId} versions={versions} />
      </div>

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

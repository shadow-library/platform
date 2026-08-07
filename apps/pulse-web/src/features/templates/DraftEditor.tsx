import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Button, Card, cn, Combobox, FormField, Input, Select, Textarea } from '@shadow-library/ui';

import { CHANNEL_OPTIONS, type Option, SectionHeader, trimToUndefined, useConfirm } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type ContentResponse,
  type NotificationChannel,
  useDeleteContentMutation,
  useListLayoutsQuery,
  useOpenDraftMutation,
  usePublishDraftMutation,
  useUpsertContentMutation,
  useVersionQuery,
  type VersionResponse,
} from '@/lib';

import PreviewDrawer from './PreviewDrawer';
import styles from './Templates.module.css';

interface EditorState {
  channel: NotificationChannel;
  locale: string;
  subject: string;
  body: string;
  layoutKey: string;
}

const DEFAULT_LOCALE = 'en-ZZ';

function blankEditor(channel: NotificationChannel): EditorState {
  return { channel, locale: DEFAULT_LOCALE, subject: '', body: '', layoutKey: '' };
}

export default function DraftEditor({ templateId, versions, channels }: { templateId: string; versions: VersionResponse[]; channels: NotificationChannel[] }): ReactElement {
  const confirm = useConfirm();
  const available = channels.length > 0 ? channels : CHANNEL_OPTIONS.map(option => option.value);
  const channelOptions = CHANNEL_OPTIONS.filter(option => available.includes(option.value));

  const draft = versions.find(version => version.status === 'DRAFT');
  const { data: draftDetail } = useVersionQuery(templateId, draft?.version);
  const contents = useMemo(() => draftDetail?.contents ?? [], [draftDetail]);

  const { data: layoutsData } = useListLayoutsQuery();
  const layoutOptions = useMemo<Option[]>(() => (layoutsData?.items ?? []).map(layout => ({ value: layout.layoutKey, label: layout.layoutKey })), [layoutsData]);

  const openDraft = useOpenDraftMutation(templateId);
  const upsert = useUpsertContentMutation(templateId);
  const remove = useDeleteContentMutation(templateId);
  const publish = usePublishDraftMutation(templateId);

  const [editor, setEditor] = useState<EditorState>(blankEditor(available[0] ?? 'EMAIL'));
  const [saveError, setSaveError] = useState('');
  const [notes, setNotes] = useState('');
  const [publishError, setPublishError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const editingExisting = contents.some(content => content.channel === editor.channel && content.locale === editor.locale);

  const loadContent = (content: ContentResponse): void => {
    setSaveError('');
    setEditor({ channel: content.channel, locale: content.locale, subject: content.subject ?? '', body: content.body, layoutKey: content.layoutKey ?? '' });
  };

  const resetEditor = (): void => {
    setSaveError('');
    setEditor(blankEditor(available[0] ?? 'EMAIL'));
  };

  const save = (): void => {
    const locale = editor.locale.trim() || DEFAULT_LOCALE;
    if (!editor.body.trim()) return setSaveError('Body is required.');
    if (editor.channel === 'EMAIL' && !editor.subject.trim()) return setSaveError('Subject is required for the EMAIL channel.');
    setSaveError('');
    upsert.mutate(
      {
        channel: editor.channel,
        locale,
        subject: editor.channel === 'EMAIL' ? editor.subject.trim() : undefined,
        body: editor.body,
        layoutKey: trimToUndefined(editor.layoutKey),
      },
      { onError: apiError => setSaveError(apiError.message) },
    );
  };

  const deleteContent = async (): Promise<void> => {
    if (!(await confirm({ title: 'Delete content?', description: `The ${editor.channel} / ${editor.locale} content will be removed from the draft.` }))) return;
    remove.mutate({ channel: editor.channel, locale: editor.locale }, { onSuccess: resetEditor, onError: apiError => setSaveError(apiError.message) });
  };

  const runPublish = (): void => {
    setPublishError('');
    publish.mutate({ notes: trimToUndefined(notes) }, { onSuccess: () => setNotes(''), onError: apiError => setPublishError(apiError.message) });
  };

  return (
    <>
      <SectionHeader
        title="Draft content"
        subtitle="Edit the single working draft, then publish it as the next version."
        action={
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
        }
      />

      {!draft ? (
        <Card padding="lg" className={styles.draftEmpty}>
          <Card.Body className={styles.draftEmptyBody}>
            <p className={styles.draftEmptyText}>No open draft. Opening one clones the current published content into an editable draft.</p>
            <Button variant="primary" onClick={() => openDraft.mutate()} loading={openDraft.isPending}>
              Open draft
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <>
          <div className={styles.chipRow}>
            {contents.map(content => (
              <button
                key={`${content.channel}-${content.locale}`}
                type="button"
                className={cn(styles.chip, editingExisting && content.channel === editor.channel && content.locale === editor.locale && styles.chipActive)}
                onClick={() => loadContent(content)}
              >
                {content.channel} · {content.locale}
              </button>
            ))}
            <button type="button" className={cn(styles.chip, !editingExisting && styles.chipActive)} onClick={resetEditor}>
              + New content
            </button>
          </div>

          <Card padding="md" className={controls.detailCard}>
            <Card.Body>
              <div className={styles.editorGrid}>
                <FormField label="Channel" required>
                  <Select
                    value={editor.channel}
                    onValueChange={value => setEditor(prev => ({ ...prev, channel: value as NotificationChannel }))}
                    disabled={editingExisting}
                    aria-label="Content channel"
                  >
                    {channelOptions.map(option => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Locale" required>
                  <Input value={editor.locale} onValueChange={value => setEditor(prev => ({ ...prev, locale: value }))} disabled={editingExisting} placeholder={DEFAULT_LOCALE} />
                </FormField>
                {editor.channel === 'EMAIL' ? (
                  <FormField label="Subject" required>
                    <Input value={editor.subject} onValueChange={value => setEditor(prev => ({ ...prev, subject: value }))} placeholder="Your order {{ orderId }} is confirmed" />
                  </FormField>
                ) : null}
                <FormField label="Layout" optional helper="Design-system shell wrapping the body.">
                  <Combobox
                    options={layoutOptions}
                    value={editor.layoutKey || null}
                    onValueChange={value => setEditor(prev => ({ ...prev, layoutKey: value ?? '' }))}
                    placeholder="No layout"
                    clearable
                  />
                </FormField>
                <FormField label="Body" required helper="Liquid template rendered per recipient.">
                  <Textarea value={editor.body} onValueChange={value => setEditor(prev => ({ ...prev, body: value }))} minRows={10} placeholder="Hi {{ firstName }}, …" />
                </FormField>
              </div>

              {saveError ? (
                <Alert intent="danger" title="Couldn't save content" className={styles.editorAlert}>
                  {saveError}
                </Alert>
              ) : null}

              <div className={styles.editorActions}>
                <Button variant="primary" onClick={save} loading={upsert.isPending}>
                  {editingExisting ? 'Save content' : 'Add content'}
                </Button>
                {editingExisting ? (
                  <Button variant="ghost" className={controls.danger} onClick={() => void deleteContent()} loading={remove.isPending}>
                    Delete content
                  </Button>
                ) : null}
              </div>
            </Card.Body>
          </Card>

          <Card padding="md" className={styles.publishBar}>
            <Card.Body className={styles.publishBarBody}>
              <FormField label="Publish notes" optional>
                <Input value={notes} onValueChange={setNotes} placeholder="Reworded the CTA copy" />
              </FormField>
              {publishError ? (
                <Alert intent="danger" title="Couldn't publish">
                  {publishError}
                </Alert>
              ) : null}
              <Button variant="primary" onClick={runPublish} loading={publish.isPending}>
                Publish draft
              </Button>
            </Card.Body>
          </Card>
        </>
      )}

      <PreviewDrawer templateId={templateId} open={previewOpen} onOpenChange={setPreviewOpen} channels={available} />
    </>
  );
}

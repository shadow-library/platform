/**
 * Importing npm packages
 */
import { CloudOutlined, SaveOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Col, Flex, Input, Row, Segmented, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useDraftQuery, useListDraftsQuery, useUpdateDraftMutation, type DraftResponse } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/chapter-editor')({
  component: ChapterEditor,
});

const reviewLabel: Record<DraftResponse['reviewStatus'], string> = {
  generating: 'Generating',
  needs_review: 'Needs review',
  contradiction: 'Contradiction',
  approved: 'Approved',
  final: 'Final',
};

function ChapterEditor() {
  const { novelId } = Route.useParams();
  const draftsQuery = useListDraftsQuery(novelId);
  const drafts = draftsQuery.data?.items ?? [];
  const [chapter, setChapter] = useState<number | undefined>(undefined);
  const focus = chapter ?? drafts[0]?.chapter;

  return (
    <div>
      <PageHeader
        title="Editor"
        subtitle="Draft, revise, and hand chapters to review."
        extra={drafts.length > 0 ? <Segmented value={focus} onChange={v => setChapter(v as number)} options={drafts.map(d => ({ label: `Ch. ${d.chapter}`, value: d.chapter }))} /> : null}
      />
      <QueryState isLoading={draftsQuery.isLoading} error={draftsQuery.error} isEmpty={focus === undefined} emptyText="No drafts yet — generate a chapter to start editing">
        <DraftEditor projectId={novelId} chapter={focus as number} />
      </QueryState>
    </div>
  );
}

function DraftEditor({ projectId, chapter }: { projectId: string; chapter: number }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const draftQuery = useDraftQuery(projectId, chapter);
  const updateDraft = useUpdateDraftMutation(projectId, chapter);
  const draft = draftQuery.data;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (draft) {
      setTitle(draft.title ?? '');
      setBody(draft.body ?? '');
    }
  }, [draft]);

  return (
    <QueryState isLoading={draftQuery.isLoading} error={draftQuery.error} isEmpty={!draft} emptyText="Draft not found">
      <Row gutter={16}>
        <Col xs={24} lg={17}>
          <Card
            title={
              <Flex align="center" justify="space-between">
                <Flex align="center" gap={8}>
                  <Text strong>Chapter {chapter}</Text>
                  {draft && <Tag color={draft.reviewStatus === 'final' ? 'green' : 'cyan'}>{reviewLabel[draft.reviewStatus]}</Tag>}
                </Flex>
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                  <CloudOutlined /> revision {draft?.revision}
                </Text>
              </Flex>
            }
          >
            <Input variant="borderless" value={title} onChange={e => setTitle(e.target.value)} placeholder="Chapter title" style={{ fontSize: 22, fontWeight: 700, paddingInline: 0, marginBottom: 8 }} />
            <Input.TextArea value={body} onChange={e => setBody(e.target.value)} variant="borderless" autoSize={{ minRows: 14 }} placeholder="Draft prose…" style={{ fontSize: 15, lineHeight: 1.8, paddingInline: 0, resize: 'none' }} />
            <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
              <Button icon={<SaveOutlined />} loading={updateDraft.isPending} onClick={() => updateDraft.mutate({ title, body }, { onSuccess: () => message.success('Draft saved'), onError: e => message.error(e.message) })}>
                Save
              </Button>
              <Button type="primary" onClick={() => navigate({ to: '/novels/$novelId/chapter-review', params: { novelId: projectId } })}>
                Send to review
              </Button>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="Chapter" size="small">
            <Flex vertical gap={8}>
              <Text type="secondary">Status: {draft?.status}</Text>
              <Text type="secondary">Review: {draft ? reviewLabel[draft.reviewStatus] : '—'}</Text>
              {draft?.volumeKey && <Text type="secondary">Volume: {draft.volumeKey}</Text>}
              {draft?.summary && (
                <>
                  <Text strong style={{ marginTop: 8 }}>
                    Summary
                  </Text>
                  <Text type="secondary">{draft.summary}</Text>
                </>
              )}
            </Flex>
          </Card>
        </Col>
      </Row>
    </QueryState>
  );
}

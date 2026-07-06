/**
 * Importing npm packages
 */
import { CheckOutlined } from '@ant-design/icons';
import { createFileRoute } from '@tanstack/react-router';
import { App, Button, Card, Col, Flex, Row, Segmented, Tag, Typography } from 'antd';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { AiTag, PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useApproveDraftMutation, useDraftRevisionsQuery, useListDraftsQuery, type DraftRevisionResponse } from '@/lib/apis';

const { Text, Paragraph } = Typography;

export const Route = createFileRoute('/novels/$novelId/chapter-review')({
  component: ChapterReview,
});

function RevisionColumn({ revision, highlight }: { revision?: DraftRevisionResponse; highlight?: boolean }) {
  return (
    <Card
      size="small"
      title={<Text style={{ color: highlight ? nf.teal : undefined }}>{revision ? `Revision ${revision.revision} · ${revision.source}` : 'No earlier revision'}</Text>}
      style={highlight ? { borderColor: nf.tealBorder } : undefined}
      styles={{ body: { maxHeight: 420, overflow: 'auto' } }}
    >
      {revision ? <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14, lineHeight: 1.7 }}>{revision.body}</Paragraph> : <Text type="secondary">This chapter has only one revision so far.</Text>}
    </Card>
  );
}

function ChapterReview() {
  const { novelId } = Route.useParams();
  const { message } = App.useApp();
  const draftsQuery = useListDraftsQuery(novelId);
  const drafts = draftsQuery.data?.items ?? [];
  const [chapter, setChapter] = useState<number | undefined>(undefined);
  const focus = chapter ?? drafts[0]?.chapter;

  const revisionsQuery = useDraftRevisionsQuery(novelId, focus);
  const approveDraft = useApproveDraftMutation(novelId);
  const revisions = [...(revisionsQuery.data?.items ?? [])].sort((a, b) => b.revision - a.revision);
  const current = revisions[0];
  const previous = revisions[1];

  return (
    <div>
      <PageHeader
        title="Review & diff"
        tags={current ? <AiTag>Revision {current.revision}</AiTag> : null}
        subtitle="Compare the latest revision against the previous, then approve."
        extra={drafts.length > 0 ? <Segmented value={focus} onChange={v => setChapter(v as number)} options={drafts.map(d => ({ label: `Ch. ${d.chapter}`, value: d.chapter }))} /> : null}
      />

      <QueryState
        isLoading={draftsQuery.isLoading || revisionsQuery.isLoading}
        error={draftsQuery.error}
        isEmpty={focus === undefined}
        emptyText="No drafts to review yet — generate a chapter first"
      >
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <RevisionColumn revision={previous} />
            </Col>
            <Col xs={24} md={12}>
              <RevisionColumn revision={current} highlight />
            </Col>
          </Row>

          {focus !== undefined && (
            <Flex justify="flex-end" gap={8}>
              <Tag style={{ alignSelf: 'center' }}>{revisions.length} revisions</Tag>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={approveDraft.isPending}
                onClick={() => approveDraft.mutate(focus, { onSuccess: () => message.success(`Chapter ${focus} approved`), onError: e => message.error(e.message) })}
              >
                Approve chapter {focus}
              </Button>
            </Flex>
          )}
        </div>
      </QueryState>
    </div>
  );
}

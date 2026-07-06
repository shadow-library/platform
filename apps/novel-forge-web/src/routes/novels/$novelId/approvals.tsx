/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Flex, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

/**
 * Importing user defined modules
 */
import { AiTag, ConflictTag, PageHeader, QueryState } from '@/components/nf';
import { useReviewQueueQuery, type DraftResponse } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/approvals')({
  component: Approvals,
});

interface QueueRow {
  key: string;
  kind: 'Draft' | 'Continuity';
  title: string;
  chapter: number;
  meta: string;
}

const reviewStatusLabel: Record<DraftResponse['reviewStatus'], string> = {
  generating: 'Generating',
  needs_review: 'Needs review',
  contradiction: 'Contradiction',
  approved: 'Approved',
  final: 'Final',
};

function Approvals() {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const query = useReviewQueueQuery(novelId);

  const drafts = query.data?.drafts ?? [];
  const proposals = query.data?.proposals ?? [];
  const rows: QueueRow[] = [
    ...drafts.map(d => ({ key: `d${d.id}`, kind: 'Draft' as const, title: d.title || `Chapter ${d.chapter}`, chapter: d.chapter, meta: reviewStatusLabel[d.reviewStatus] })),
    ...proposals.map(p => ({ key: `p${p.id}`, kind: 'Continuity' as const, title: `Continuity — Chapter ${p.chapter}`, chapter: p.chapter, meta: p.status })),
  ];

  const columns: ColumnsType<QueueRow> = [
    { title: 'Type', dataIndex: 'kind', width: 130, render: (kind: QueueRow['kind']) => (kind === 'Continuity' ? <ConflictTag>Continuity</ConflictTag> : <AiTag>Draft</AiTag>) },
    { title: 'Item', dataIndex: 'title', render: (t: string) => <Text>{t}</Text> },
    { title: 'State', dataIndex: 'meta', width: 140, render: (m: string) => <Tag>{m}</Tag> },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, row) => (
        <Flex justify="flex-end">
          <Button
            size="small"
            type="primary"
            onClick={() => navigate({ to: row.kind === 'Continuity' ? '/novels/$novelId/continuity' : '/novels/$novelId/chapter-review', params: { novelId } })}
          >
            Open
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Review & approval queue"
        tags={rows.length ? <AiTag>{rows.length} pending</AiTag> : null}
        subtitle="Everything the AI has produced that awaits your sign-off — drafts and continuity proposals."
      />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={rows.length === 0} emptyText="Queue clear — nothing awaiting approval 🎉">
        <Card styles={{ body: { padding: 0 } }}>
          <Table rowKey="key" columns={columns} dataSource={rows} pagination={false} />
        </Card>
      </QueryState>
    </div>
  );
}

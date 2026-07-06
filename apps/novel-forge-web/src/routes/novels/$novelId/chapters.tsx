/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Segmented, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useListChaptersQuery, type ChapterListResponse, type ChapterStatus } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/chapters')({
  component: Chapters,
});

type Filter = 'all' | ChapterStatus;

const statusColor: Record<ChapterStatus, string> = { done: 'green', failed: 'red', skipped: 'default' };

function Chapters() {
  const { novelId } = Route.useParams();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useListChaptersQuery(novelId, { limit: 200 });
  const all = query.data?.items ?? [];
  const data = filter === 'all' ? all : all.filter(c => c.status === filter);

  const columns: ColumnsType<ChapterListResponse> = [
    { title: '#', dataIndex: 'number', width: 60, render: (n: number) => <Text type="secondary">{n}</Text> },
    { title: 'Title', dataIndex: 'title', render: (t: string | null) => <Text strong>{t || 'Untitled'}</Text> },
    { title: 'Words', dataIndex: 'wordCount', width: 100, align: 'right', responsive: ['sm'], render: (w: number | null) => <Text type="secondary">{w ? w.toLocaleString() : '—'}</Text> },
    { title: 'Continuity', dataIndex: 'continuityApplied', width: 120, responsive: ['md'], render: (applied: boolean) => (applied ? <Tag color="cyan">Applied</Tag> : <Text type="secondary">—</Text>) },
    { title: 'Status', dataIndex: 'status', width: 110, render: (s: ChapterStatus) => <Tag color={statusColor[s]}>{s}</Tag> },
  ];

  return (
    <div>
      <PageHeader
        title="Chapters"
        subtitle={query.data ? `${query.data.total} source chapters ingested for this novel.` : 'The ingested source chapters for this novel.'}
        extra={
          <Segmented
            value={filter}
            onChange={v => setFilter(v as Filter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Done', value: 'done' },
              { label: 'Skipped', value: 'skipped' },
              { label: 'Failed', value: 'failed' },
            ]}
          />
        }
      />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={all.length === 0} emptyText="No source chapters yet — ingest a source or generate drafts to populate this list">
        <Card styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" columns={columns} dataSource={data} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
        </Card>
      </QueryState>
    </div>
  );
}

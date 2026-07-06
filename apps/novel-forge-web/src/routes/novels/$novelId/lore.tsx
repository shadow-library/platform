/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Table } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useListEntitiesQuery, type EntityResponse } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/lore')({
  component: Lore,
});

function Lore() {
  const { novelId } = Route.useParams();
  const query = useListEntitiesQuery(novelId, { type: 'item', limit: 100 });
  const items = query.data?.items ?? [];

  const columns: ColumnsType<EntityResponse> = [
    { title: 'Lore entry', dataIndex: 'name', render: (name: string) => <Text strong>{name}</Text> },
    { title: 'Origin', dataIndex: 'origin', width: 160, responsive: ['sm'], render: (o: string | null) => <Text type="secondary">{o || '—'}</Text> },
    { title: 'First seen', dataIndex: 'firstSeenChapter', width: 120, responsive: ['md'], render: (n: number | null) => <Text type="secondary">{n ? `Ch. ${n}` : '—'}</Text> },
    { title: 'Significance', dataIndex: 'significance', width: 130, render: (s: EntityResponse['significance']) => <Tag color={s === 'major' ? 'cyan' : 'default'}>{s === 'major' ? 'Major' : 'Minor'}</Tag> },
  ];

  return (
    <div>
      <PageHeader title="Lore entries" subtitle="Items, artifacts, and facts that make up the novel’s knowledge base." />
      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={items.length === 0} emptyText="No lore items yet — run Extract to capture them from the prose">
        <Card styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" columns={columns} dataSource={items} pagination={{ pageSize: 12, hideOnSinglePage: true }} />
        </Card>
      </QueryState>
    </div>
  );
}

/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Card, Col, Row, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { useListEntitiesQuery } from '@/lib/apis';
import { coverColor } from '@/lib/format';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/characters')({
  component: Characters,
});

function Characters() {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const query = useListEntitiesQuery(novelId, { type: 'character', limit: 100 });
  const items = query.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Characters" subtitle={query.data ? `${query.data.total} cast members extracted for this novel.` : 'The novel’s cast, extracted from its prose and plan.'} />

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={items.length === 0}
        emptyText="No characters yet — run Extract or Plan to populate the cast"
      >
        <Row gutter={[16, 16]}>
          {items.map(c => (
            <Col xs={12} sm={8} lg={6} key={c.id}>
              <Card hoverable styles={{ body: { padding: 12 } }} onClick={() => navigate({ to: '/novels/$novelId/character/$characterId', params: { novelId, characterId: c.entityKey } })}>
                <AssetBox height={72} color={coverColor(c.entityKey)} />
                <Text strong ellipsis style={{ display: 'block', marginTop: 8 }}>
                  {c.name}
                </Text>
                <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
                  {c.status || c.origin || 'Character'}
                </Text>
                <Tag color={c.significance === 'major' ? 'cyan' : 'default'} style={{ marginTop: 8 }}>
                  {c.significance === 'major' ? 'Major' : 'Minor'}
                </Tag>
              </Card>
            </Col>
          ))}
        </Row>
      </QueryState>
    </div>
  );
}

/**
 * Importing npm packages
 */
import { Card, Col, Row, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { useListEntitiesQuery, type EntityType } from '@/lib/apis';
import { coverColor } from '@/lib/format';

const { Text } = Typography;

export interface EntityGridProps {
  projectId: string;
  type: EntityType;
  title: string;
  subtitle: string;
  singular: string;
  span?: { xs: number; sm: number; lg: number };
}

/** A reusable grid of entity cards for a single entity type (locations, factions, species…). */
export function EntityGrid({ projectId, type, title, subtitle, singular, span = { xs: 12, sm: 8, lg: 6 } }: EntityGridProps) {
  const query = useListEntitiesQuery(projectId, { type, limit: 100 });
  const items = query.data?.items ?? [];

  return (
    <div>
      <PageHeader title={title} subtitle={query.data ? `${query.data.total} ${query.data.total === 1 ? singular : `${singular}s`}.` : subtitle} />
      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={items.length === 0} emptyText={`No ${singular}s yet — run Extract to populate them from the prose`}>
        <Row gutter={[16, 16]}>
          {items.map(e => (
            <Col {...span} key={e.id}>
              <Card styles={{ body: { padding: 12 } }}>
                <AssetBox height={80} color={coverColor(e.entityKey)} />
                <Text strong ellipsis style={{ display: 'block', marginTop: 8 }}>
                  {e.name}
                </Text>
                <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
                  {e.status || e.origin || (singular as ReactNode)}
                </Text>
                {e.significance && (
                  <Tag color={e.significance === 'major' ? 'cyan' : 'default'} style={{ marginTop: 8 }}>
                    {e.significance === 'major' ? 'Major' : 'Minor'}
                  </Tag>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </QueryState>
    </div>
  );
}

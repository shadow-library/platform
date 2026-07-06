/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Collapse, Descriptions, Flex, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useListVolumesQuery, type VolumeResponse } from '@/lib/apis';

const { Text, Paragraph } = Typography;

export const Route = createFileRoute('/novels/$novelId/volumes')({
  component: Volumes,
});

function statusColor(status: VolumeResponse['status']): string {
  if (status === 'approved') return 'green';
  if (status === 'draft') return 'cyan';
  return 'default';
}

function Volumes() {
  const { novelId } = Route.useParams();
  const query = useListVolumesQuery(novelId, { limit: 100 });
  const volumes = [...(query.data?.items ?? [])].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div>
      <PageHeader title="Volumes & Arcs" subtitle="The macro-structure of the series — objective, conflict, and payoff per volume." />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={volumes.length === 0} emptyText="No volumes yet — run Plan and approve to generate the volume structure">
        <Collapse
          defaultActiveKey={volumes.map(v => v.id)}
          items={volumes.map(vol => ({
            key: vol.id,
            label: (
              <Flex align="center" gap={12} wrap="wrap">
                <Tag color="cyan">Volume {vol.ordinal}</Tag>
                <Text strong>{vol.title || vol.volumeKey}</Text>
                <Tag color={statusColor(vol.status)} style={{ marginLeft: 'auto' }}>
                  {vol.status}
                </Tag>
                {vol.startChapter && vol.endChapter ? (
                  <Text type="secondary">
                    chs {vol.startChapter}–{vol.endChapter}
                  </Text>
                ) : null}
              </Flex>
            ),
            children: (
              <>
                <Descriptions column={1} size="small" styles={{ label: { width: 110 } }}>
                  {vol.objective && <Descriptions.Item label="Objective">{vol.objective}</Descriptions.Item>}
                  {vol.conflict && <Descriptions.Item label="Conflict">{vol.conflict}</Descriptions.Item>}
                  {vol.payoff && <Descriptions.Item label="Payoff">{vol.payoff}</Descriptions.Item>}
                </Descriptions>
                {vol.body && (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    {vol.body}
                  </Paragraph>
                )}
                {!vol.objective && !vol.conflict && !vol.payoff && !vol.body && <Text type="secondary">No details captured for this volume yet.</Text>}
              </>
            ),
          }))}
        />
      </QueryState>
    </div>
  );
}

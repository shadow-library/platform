/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Flex, Tag, Timeline as AntTimeline, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useListVolumesQuery } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/timeline')({
  component: TimelinePage,
});

function TimelinePage() {
  const { novelId } = Route.useParams();
  const query = useListVolumesQuery(novelId, { limit: 100 });
  const volumes = [...(query.data?.items ?? [])].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div>
      <PageHeader title="Timeline" subtitle="Story chronology laid out by volume and chapter span." />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={volumes.length === 0} emptyText="No timeline yet — approve a plan to lay out the volume structure">
        <Card>
          <AntTimeline
            mode="left"
            items={volumes.map(vol => ({
              color: nf.teal,
              label: <Text type="secondary">{vol.startChapter && vol.endChapter ? `chs ${vol.startChapter}–${vol.endChapter}` : `Volume ${vol.ordinal}`}</Text>,
              children: (
                <div>
                  <Text strong>{vol.title || vol.volumeKey}</Text>
                  {vol.objective && (
                    <Text type="secondary" style={{ display: 'block' }}>
                      {vol.objective}
                    </Text>
                  )}
                  <Flex gap={6} style={{ marginTop: 4 }}>
                    <Tag color={vol.status === 'approved' ? 'green' : 'cyan'}>{vol.status}</Tag>
                  </Flex>
                </div>
              ),
            }))}
          />
        </Card>
      </QueryState>
    </div>
  );
}

/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Flex, Segmented, Tag, Timeline, Typography } from 'antd';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useDraftRevisionsQuery, useListDraftsQuery } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/versions')({
  component: Versions,
});

function Versions() {
  const { novelId } = Route.useParams();
  const draftsQuery = useListDraftsQuery(novelId);
  const drafts = draftsQuery.data?.items ?? [];
  const [chapter, setChapter] = useState<number | undefined>(undefined);
  const focus = chapter ?? drafts[0]?.chapter;

  const revisionsQuery = useDraftRevisionsQuery(novelId, focus);
  const revisions = [...(revisionsQuery.data?.items ?? [])].sort((a, b) => b.revision - a.revision);

  return (
    <div>
      <PageHeader
        title="Version history"
        subtitle="Every draft revision is retained — restore or fork from any point."
        extra={
          drafts.length > 0 ? (
            <Segmented
              value={focus}
              onChange={v => setChapter(v as number)}
              options={drafts.map(d => ({ label: `Ch. ${d.chapter}`, value: d.chapter }))}
            />
          ) : null
        }
      />

      <QueryState
        isLoading={draftsQuery.isLoading || revisionsQuery.isLoading}
        error={draftsQuery.error}
        isEmpty={drafts.length === 0}
        emptyText="No drafts yet — generate a chapter to start its version history"
      >
        <Card>
          {revisions.length === 0 ? (
            <Text type="secondary">No revisions recorded for this chapter yet.</Text>
          ) : (
            <Timeline
              items={revisions.map((rev, i) => ({
                color: i === 0 ? nf.teal : 'gray',
                children: (
                  <Flex align="center" justify="space-between" gap={12}>
                    <div>
                      <Text strong>Revision {rev.revision}</Text>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        {rev.source} · {new Date(rev.createdAt).toLocaleString()}
                      </Text>
                      {rev.summary && (
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                          {rev.summary}
                        </Text>
                      )}
                    </div>
                    {i === 0 && <Tag color="green">Current</Tag>}
                  </Flex>
                ),
              }))}
            />
          )}
        </Card>
      </QueryState>
    </div>
  );
}

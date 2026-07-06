/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Descriptions, Flex, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { ConflictTag, PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useReviewQueueQuery, type ContinuityProposalResponse } from '@/lib/apis';

const { Text, Paragraph } = Typography;

export const Route = createFileRoute('/novels/$novelId/continuity')({
  component: Continuity,
});

/** The proposal payload is a free-form object; surface a human summary if present. */
function proposalSummary(proposal: ContinuityProposalResponse['proposal']): string | null {
  if (!proposal || typeof proposal !== 'object') return null;
  const p = proposal as Record<string, unknown>;
  const value = p.summary ?? p.description ?? p.note ?? p.rationale;
  return typeof value === 'string' ? value : null;
}

function Continuity() {
  const { novelId } = Route.useParams();
  const query = useReviewQueueQuery(novelId);
  const proposals = query.data?.proposals ?? [];

  return (
    <div>
      <PageHeader
        title="Continuity report"
        tags={proposals.length ? <ConflictTag>{proposals.length} open</ConflictTag> : null}
        subtitle="Contradictions the AI found across the manuscript, awaiting your decision."
      />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={proposals.length === 0} emptyText="No continuity issues — the manuscript is consistent">
        <Flex vertical gap={16}>
          {proposals.map(p => {
            const summary = proposalSummary(p.proposal);
            return (
              <Card key={p.id} style={{ borderColor: nf.aiBorder, background: nf.aiBg }}>
                <Flex align="center" gap={12} wrap="wrap" style={{ marginBottom: 8 }}>
                  <ConflictTag>Chapter {p.chapter}</ConflictTag>
                  <Text strong style={{ flex: 1 }}>
                    Continuity proposal
                  </Text>
                  <Tag>{p.status}</Tag>
                </Flex>
                {summary && (
                  <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    {summary}
                  </Paragraph>
                )}
                <Descriptions column={1} size="small" styles={{ label: { width: 90 } }}>
                  {p.model && <Descriptions.Item label="Model">{p.model}</Descriptions.Item>}
                  {p.appliedAt && <Descriptions.Item label="Applied">{new Date(p.appliedAt).toLocaleString()}</Descriptions.Item>}
                </Descriptions>
              </Card>
            );
          })}
        </Flex>
      </QueryState>
    </div>
  );
}

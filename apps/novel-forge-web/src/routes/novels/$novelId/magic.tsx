/**
 * Importing npm packages
 */
import { WarningOutlined } from '@ant-design/icons';
import { createFileRoute } from '@tanstack/react-router';
import { Alert, Card, Flex, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useListEntitiesQuery } from '@/lib/apis';

const { Paragraph, Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/magic')({
  component: Magic,
});

function Magic() {
  const { novelId } = Route.useParams();
  const query = useListEntitiesQuery(novelId, { type: 'power_rule', limit: 100 });
  const rules = query.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Power / magic system" subtitle="The hard rules that keep the world consistent — and that continuity checks enforce." />

      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={rules.length === 0} emptyText="No power rules yet — run Extract to capture them from the prose">
        <div>
          <Card style={{ marginBottom: 16 }} styles={{ body: { paddingTop: 8, paddingBottom: 8 } }}>
            {rules.map((rule, i) => (
              <Flex key={rule.id} align="flex-start" gap={12} style={{ padding: '12px 0', borderTop: i === 0 ? undefined : '1px solid var(--color-border-secondary)' }}>
                <Tag color="cyan">Rule {i + 1}</Tag>
                <div style={{ flex: 1 }}>
                  <Text strong>{rule.name}</Text>
                  {(rule.body || rule.notes) && (
                    <Paragraph type="secondary" style={{ margin: '2px 0 0' }}>
                      {rule.body || rule.notes}
                    </Paragraph>
                  )}
                </div>
              </Flex>
            ))}
          </Card>

          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            title="Continuity guardrails"
            description="Every draft is checked against these rules. Change a rule and Novel Forge re-scans affected chapters for new contradictions."
          />
        </div>
      </QueryState>
    </div>
  );
}

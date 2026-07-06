/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Card, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/nf';
import { useAssetsQuery } from '@/lib/apis';

const { Paragraph } = Typography;

export const Route = createFileRoute('/novels/$novelId/assets')({
  component: Assets,
});

function Assets() {
  const { novelId } = Route.useParams();
  const query = useAssetsQuery(novelId);
  const markdown = query.data?.markdown?.trim() ?? '';
  const notFound = query.error?.status === 404;

  return (
    <div>
      <PageHeader title="Assets" subtitle="Illustrations and reference imagery linked to this novel’s entities." />

      <QueryState
        isLoading={query.isLoading}
        error={notFound ? null : query.error}
        isEmpty={markdown.length === 0}
        emptyText="No assets yet — generate entity illustrations to build the gallery"
      >
        <Card>
          <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{markdown}</Paragraph>
        </Card>
      </QueryState>
    </div>
  );
}

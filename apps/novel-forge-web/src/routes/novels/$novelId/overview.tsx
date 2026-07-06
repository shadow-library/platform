/**
 * Importing npm packages
 */
import { ProfileOutlined, ReadOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Col, Flex, Progress, Row, Statistic, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useProjectQuery, useProjectStatusQuery } from '@/lib/apis';
import { coverColor, projectKindLabel, projectTitle } from '@/lib/format';

const { Title, Text, Paragraph } = Typography;

export const Route = createFileRoute('/novels/$novelId/overview')({
  component: Overview,
});

function Overview() {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const projectQuery = useProjectQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const project = projectQuery.data;
  const status = statusQuery.data;

  const finalPct = status?.draftsTotal ? Math.round(((status.draftsFinal ?? 0) / status.draftsTotal) * 100) : 0;

  return (
    <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyText="Novel not found">
      <div>
        <PageHeader title={<>Overview</>} />
        {project && (
          <>
            <Card style={{ marginBottom: 16 }}>
              <Flex gap={20} align="flex-start" wrap="wrap">
                <AssetBox width={96} height={132} color={coverColor(project.id)} />
                <Flex vertical gap={10} style={{ flex: 1, minWidth: 240 }}>
                  <Title level={3} style={{ margin: 0 }}>
                    {projectTitle(project)}
                  </Title>
                  <Flex gap={8} wrap="wrap">
                    <Tag color="cyan">{projectKindLabel(project.kind)}</Tag>
                    <Tag>{project.contentMode === 'grok_only' ? 'Grok only' : 'Standard'}</Tag>
                    {status?.volumesTotal ? <Tag>{status.volumesTotal} volumes</Tag> : null}
                    <Tag color={status?.planApproved ? 'green' : 'default'}>{status?.planApproved ? 'Plan approved' : 'Planning'}</Tag>
                  </Flex>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    {project.brief?.trim() || 'No brief yet. Run Plan to have AI draft the premise, themes, and cast for this novel.'}
                  </Paragraph>
                  <Flex gap={8} wrap="wrap" style={{ marginTop: 4 }}>
                    <Button type="primary" icon={<ReadOutlined />} onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })}>
                      {project.storyCurrentChapter ? `Resume Ch. ${project.storyCurrentChapter}` : 'Open chapters'}
                    </Button>
                    <Button icon={<ProfileOutlined />} onClick={() => navigate({ to: '/novels/$novelId/story-bible', params: { novelId } })}>
                      Story Bible
                    </Button>
                  </Flex>
                </Flex>
                <Flex vertical align="center" gap={6}>
                  <Progress type="circle" percent={finalPct} size={72} strokeColor={nf.teal} />
                  <Text type="secondary">drafts final</Text>
                </Flex>
              </Flex>
            </Card>

            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic title="Chapters" value={status?.chaptersTotal ?? 0} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic title="Extracted" value={status?.chaptersExtracted ?? 0} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic title="Drafts" value={status?.draftsFinal ?? 0} suffix={`/ ${status?.draftsTotal ?? 0}`} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card>
                  <Statistic title="Volumes" value={status?.volumesTotal ?? 0} />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>
    </QueryState>
  );
}

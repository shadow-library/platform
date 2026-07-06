/**
 * Importing npm packages
 */
import { PlusOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Col, Flex, Row, Statistic, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { useListProjectsQuery } from '@/lib/apis';
import { coverColor, projectKindLabel, projectTitle } from '@/lib/format';

const { Text } = Typography;

export const Route = createFileRoute('/_app/')({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const projectsQuery = useListProjectsQuery({ limit: 50 });
  const projects = projectsQuery.data?.items ?? [];
  const originals = projects.filter(p => p.kind === 'new_novel').length;
  const adapted = projects.filter(p => p.kind === 'source').length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your studio at a glance — pick up a novel or start a new one."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate({ to: '/projects' })}>
            New novel
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Novels" value={projects.length} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Original" value={originals} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card>
            <Statistic title="Adapted" value={adapted} />
          </Card>
        </Col>
      </Row>

      <Text type="secondary" strong>
        Your novels
      </Text>
      <div style={{ marginTop: 8 }}>
        <QueryState
          isLoading={projectsQuery.isLoading}
          error={projectsQuery.error}
          isEmpty={projects.length === 0}
          emptyText="No novels yet — create your first to start writing"
          emptyExtra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate({ to: '/projects' })}>
              New novel
            </Button>
          }
        >
          <Row gutter={[16, 16]}>
            {projects.map(project => (
              <Col xs={24} md={12} lg={8} key={project.id}>
                <Card hoverable onClick={() => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } })}>
                  <Flex gap={14} align="flex-start">
                    <AssetBox width={44} height={60} color={coverColor(project.id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong ellipsis style={{ display: 'block' }}>
                        {projectTitle(project)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {projectKindLabel(project.kind)}
                      </Text>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                        {project.storyCurrentChapter ? `Chapter ${project.storyCurrentChapter}` : 'Not started'}
                      </Text>
                    </div>
                  </Flex>
                </Card>
              </Col>
            ))}
          </Row>
        </QueryState>
      </div>
    </div>
  );
}

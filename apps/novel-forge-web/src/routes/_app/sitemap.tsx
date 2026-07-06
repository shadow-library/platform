/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Card, Col, Flex, Row, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader } from '@/components/nf';
import { nf } from '@/constants';
import { useListProjectsQuery } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/_app/sitemap')({
  component: Sitemap,
});

type Node = { label: string; to?: string; params?: Record<string, string>; ai?: boolean };

const globalNodes: Node[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Projects', to: '/projects' },
  { label: 'Settings', to: '/settings' },
  { label: 'Profile', to: '/profile' },
];

const workspaceGroups: { title: string; accent: string; nodes: Node[] }[] = [
  {
    title: 'Plan',
    accent: nf.teal,
    nodes: [
      { label: 'Overview', to: '/novels/$novelId/overview' },
      { label: 'Story Bible', to: '/novels/$novelId/story-bible' },
      { label: 'World', to: '/novels/$novelId/world' },
      { label: 'Plot', to: '/novels/$novelId/plot' },
      { label: 'Volumes & Arcs', to: '/novels/$novelId/volumes' },
      { label: 'Timeline', to: '/novels/$novelId/timeline' },
    ],
  },
  {
    title: 'Lore',
    accent: nf.teal,
    nodes: [
      { label: 'Characters', to: '/novels/$novelId/characters' },
      { label: 'Locations', to: '/novels/$novelId/locations' },
      { label: 'Factions', to: '/novels/$novelId/factions' },
      { label: 'Magic system', to: '/novels/$novelId/magic' },
      { label: 'Species', to: '/novels/$novelId/species' },
      { label: 'Lore entries', to: '/novels/$novelId/lore' },
    ],
  },
  {
    title: 'Write',
    accent: nf.teal,
    nodes: [
      { label: 'Chapters', to: '/novels/$novelId/chapters' },
      { label: 'Chapter brief', to: '/novels/$novelId/chapter-brief', ai: true },
      { label: 'Editor', to: '/novels/$novelId/chapter-editor' },
      { label: 'Generate', to: '/novels/$novelId/chapter-generate', ai: true },
      { label: 'Review & diff', to: '/novels/$novelId/chapter-review' },
    ],
  },
  {
    title: 'QA',
    accent: nf.ai,
    nodes: [
      { label: 'Continuity', to: '/novels/$novelId/continuity', ai: true },
      { label: 'Approvals', to: '/novels/$novelId/approvals', ai: true },
      { label: 'Version history', to: '/novels/$novelId/versions' },
      { label: 'Assets', to: '/novels/$novelId/assets' },
    ],
  },
];

function Sitemap() {
  const navigate = useNavigate();
  const demoNovel = useListProjectsQuery({ limit: 1 }).data?.items[0]?.id;

  const go = (node: Node) => {
    if (!node.to) return;
    if (node.to.includes('$novelId')) {
      if (!demoNovel) return navigate({ to: '/projects' });
      return navigate({ to: node.to, params: { novelId: demoNovel } });
    }
    return navigate({ to: node.to });
  };

  const chip = (node: Node) => (
    <Tag
      key={node.label}
      color={node.ai ? undefined : 'cyan'}
      onClick={() => go(node)}
      style={{ cursor: 'pointer', marginBottom: 6, ...(node.ai ? { background: nf.aiBg, borderColor: nf.aiBorder, color: nf.ai, fontWeight: 600 } : {}) }}
    >
      {node.label}
    </Tag>
  );

  return (
    <div>
      <PageHeader
        title="Information architecture"
        subtitle="The whole product on one map. Cyan marks AI / human-in-the-loop touchpoints. Click any node to jump there."
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card title="Entry" style={{ height: '100%' }}>
            <Flex vertical gap={8}>
              <Tag color="cyan" style={{ cursor: 'pointer' }} onClick={() => navigate({ to: '/login' })}>
                Auth / SSO
              </Tag>
              <Text type="secondary">Signs the writer into the studio.</Text>
              <Text type="secondary" style={{ marginTop: 'auto' }}>
                ↓ then the global rail
              </Text>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card title="Global app rail" style={{ height: '100%' }}>
            <Flex wrap="wrap" gap={4}>
              {globalNodes.map(chip)}
            </Flex>
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              Open a novel → its workspace
            </Text>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Per-novel workspace" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              {workspaceGroups.map(group => (
                <Col xs={12} key={group.title}>
                  <Text strong style={{ color: group.accent, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.1em' }}>
                    {group.title}
                  </Text>
                  <Flex wrap="wrap" gap={4} style={{ marginTop: 8 }}>
                    {group.nodes.map(chip)}
                  </Flex>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

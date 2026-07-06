/**
 * Importing npm packages
 */
import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Flex, Input, Popconfirm, Segmented, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { useDeleteProjectMutation, useListProjectsQuery, type ProjectResponse } from '@/lib/apis';
import { coverColor, projectKindLabel, projectTitle } from '@/lib/format';
import { NewNovelModal } from '@/features/projects/NewNovelModal';

const { Text } = Typography;

type Filter = 'all' | ProjectResponse['kind'];

export const Route = createFileRoute('/_app/projects')({
  component: Projects,
});

function Projects() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const projectsQuery = useListProjectsQuery({ limit: 100 });
  const deleteProject = useDeleteProjectMutation();
  const items = projectsQuery.data?.items ?? [];

  const data = useMemo(
    () => items.filter(p => (filter === 'all' || p.kind === filter) && projectTitle(p).toLowerCase().includes(query.toLowerCase())),
    [items, filter, query],
  );

  const remove = (project: ProjectResponse) =>
    deleteProject.mutate(project.id, {
      onSuccess: () => message.success(`Deleted “${projectTitle(project)}”`),
      onError: err => message.error(err.message),
    });

  const columns: ColumnsType<ProjectResponse> = [
    {
      title: 'Title',
      dataIndex: 'name',
      render: (_, project) => (
        <Flex align="center" gap={12}>
          <AssetBox width={26} height={34} color={coverColor(project.id)} radius={4} />
          <Text strong>{projectTitle(project)}</Text>
        </Flex>
      ),
    },
    { title: 'Kind', dataIndex: 'kind', responsive: ['md'], render: (kind: ProjectResponse['kind']) => <Tag color={kind === 'new_novel' ? 'cyan' : 'default'}>{projectKindLabel(kind)}</Tag> },
    { title: 'Chapter', key: 'chapter', width: 110, render: (_, p) => <Text type="secondary">{p.storyCurrentChapter ? `Ch. ${p.storyCurrentChapter}` : '—'}</Text>, responsive: ['sm'] },
    { title: 'Mode', dataIndex: 'contentMode', width: 120, responsive: ['lg'], render: (mode: ProjectResponse['contentMode']) => <Tag>{mode === 'grok_only' ? 'Grok only' : 'Standard'}</Tag> },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (_, project) => (
        <Popconfirm title="Delete this novel?" description="This cannot be undone." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(project)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Every novel in your studio, from first premise to finished manuscript."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New novel
          </Button>
        }
      />

      <Flex align="center" justify="space-between" gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search novels" value={query} onChange={e => setQuery(e.target.value)} style={{ maxWidth: 260 }} />
        <Segmented
          value={filter}
          onChange={val => setFilter(val as Filter)}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Original', value: 'new_novel' },
            { label: 'Adapted', value: 'source' },
          ]}
        />
      </Flex>

      <QueryState
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        isEmpty={items.length === 0}
        emptyText="No novels yet — create your first"
        emptyExtra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New novel
          </Button>
        }
      >
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 12, hideOnSinglePage: true }}
            onRow={project => ({ onClick: () => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } }), style: { cursor: 'pointer' } })}
          />
        </Card>
      </QueryState>

      <NewNovelModal open={modalOpen} onCancel={() => setModalOpen(false)} onCreated={project => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } })} />
    </div>
  );
}

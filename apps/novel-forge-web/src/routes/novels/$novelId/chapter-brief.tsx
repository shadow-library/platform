/**
 * Importing npm packages
 */
import { SaveOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Flex, Input, Segmented, Typography } from 'antd';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { AiTag, PageHeader, QueryState } from '@/components/nf';
import { useBriefQuery, useListDraftsQuery, useProjectQuery, useUpdateBriefMutation } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/chapter-brief')({
  component: ChapterBrief,
});

function ChapterBrief() {
  const { novelId } = Route.useParams();
  const draftsQuery = useListDraftsQuery(novelId);
  const project = useProjectQuery(novelId).data;
  const drafts = draftsQuery.data?.items ?? [];
  const chapterOptions = drafts.map(d => d.chapter);
  const [chapter, setChapter] = useState<number | undefined>(undefined);
  const focus = chapter ?? chapterOptions[0] ?? project?.storyCurrentChapter ?? undefined;

  return (
    <div>
      <PageHeader
        title="Chapter brief"
        tags={<AiTag>AI plan</AiTag>}
        subtitle="The structured plan the writing step turns into prose."
        extra={
          chapterOptions.length > 0 ? (
            <Segmented value={focus} onChange={v => setChapter(v as number)} options={chapterOptions.map(n => ({ label: `Ch. ${n}`, value: n }))} />
          ) : null
        }
      />

      <QueryState
        isLoading={draftsQuery.isLoading}
        error={draftsQuery.error}
        isEmpty={focus === undefined}
        emptyText="No chapters yet — generate a chapter to see its brief"
      >
        <BriefEditor projectId={novelId} chapter={focus as number} />
      </QueryState>
    </div>
  );
}

function BriefEditor({ projectId, chapter }: { projectId: string; chapter: number }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const briefQuery = useBriefQuery(projectId, chapter);
  const updateBrief = useUpdateBriefMutation(projectId, chapter);
  const [body, setBody] = useState('');
  const notFound = briefQuery.error?.status === 404;

  useEffect(() => {
    if (briefQuery.data) setBody(briefQuery.data.body);
  }, [briefQuery.data]);

  return (
    <QueryState isLoading={briefQuery.isLoading} error={notFound ? null : briefQuery.error} isEmpty={!briefQuery.data && notFound} emptyText={`No brief for Chapter ${chapter} yet`}>
      <Card
        title={
          <Flex align="center" gap={10}>
            <Text strong>Chapter {chapter}</Text>
            {briefQuery.data?.title && <Text type="secondary">{briefQuery.data.title}</Text>}
          </Flex>
        }
      >
        <Input.TextArea value={body} onChange={e => setBody(e.target.value)} autoSize={{ minRows: 10 }} style={{ fontSize: 14, lineHeight: 1.7 }} />
        <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
          <Button
            icon={<SaveOutlined />}
            loading={updateBrief.isPending}
            onClick={() => updateBrief.mutate({ body }, { onSuccess: () => message.success('Brief saved'), onError: e => message.error(e.message) })}
          >
            Save brief
          </Button>
          <Button type="primary" onClick={() => navigate({ to: '/novels/$novelId/chapter-generate', params: { novelId: projectId } })}>
            Write chapter
          </Button>
        </Flex>
      </Card>
    </QueryState>
  );
}

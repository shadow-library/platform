/**
 * Importing npm packages
 */
import { CheckOutlined, EditOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Col, Flex, Input, Row, Segmented, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { AiTag, PageHeader, QueryState } from '@/components/nf';
import { nf } from '@/constants';
import { useDraftQuery, useGenerateMutation, useListDraftsQuery, useListEntitiesQuery } from '@/lib/apis';

const { Text } = Typography;

export const Route = createFileRoute('/novels/$novelId/chapter-generate')({
  component: ChapterGenerate,
});

function ChapterGenerate() {
  const { novelId } = Route.useParams();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const draftsQuery = useListDraftsQuery(novelId);
  const drafts = draftsQuery.data?.items ?? [];
  const [chapter, setChapter] = useState<number | undefined>(undefined);
  const focus = chapter ?? drafts[0]?.chapter;

  const draftQuery = useDraftQuery(novelId, focus);
  const entities = useListEntitiesQuery(novelId, { limit: 100 }).data?.items ?? [];
  const generate = useGenerateMutation(novelId);

  const [guidance, setGuidance] = useState('');
  const [shown, setShown] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const fullText = draftQuery.data?.body ?? '';

  // Reveal the real draft body with a light streaming animation when it loads.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!fullText) {
      setShown('');
      return;
    }
    let i = 0;
    setShown('');
    timer.current = setInterval(() => {
      i += 6;
      setShown(fullText.slice(0, i));
      if (i >= fullText.length && timer.current) clearInterval(timer.current);
    }, 16);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fullText]);

  const runGenerate = () =>
    generate.mutate(
      { limit: 1, autoFix: true, maxFixes: 2, guidance },
      { onSuccess: () => message.success('Generation enqueued — drafts will appear as they complete'), onError: e => message.error(e.message) },
    );

  return (
    <div>
      <PageHeader title="Generate" tags={<AiTag>AI</AiTag>} subtitle="Kick off chapter generation and watch drafts form from your plan and canon." />

      <QueryState isLoading={draftsQuery.isLoading} error={draftsQuery.error} isEmpty={false}>
        <Row gutter={16}>
          <Col xs={24} lg={8}>
            <Card size="small" title="Context" style={{ marginBottom: 16 }}>
              <Flex gap={8} wrap="wrap">
                <Tag color="cyan">{entities.length} entities</Tag>
                <Tag color="cyan">{drafts.length} drafts</Tag>
              </Flex>
            </Card>
            <Card size="small" title="Guidance" style={{ marginBottom: 16 }}>
              <Input.TextArea rows={3} value={guidance} onChange={e => setGuidance(e.target.value)} placeholder="Optional steering for this generation…" />
              <Text type="secondary" style={{ display: 'block', marginTop: 12, marginBottom: 6 }}>
                Creativity
              </Text>
              <Segmented defaultValue="Balanced" options={['Precise', 'Balanced', 'Creative']} block />
            </Card>
            <Button type="primary" block icon={<ThunderboltOutlined />} loading={generate.isPending} onClick={runGenerate}>
              Generate next chapter
            </Button>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              title={
                <Flex align="center" justify="space-between">
                  <Text strong>{focus ? `Draft — Chapter ${focus}` : 'Draft preview'}</Text>
                  {drafts.length > 0 && <Segmented size="small" value={focus} onChange={v => setChapter(v as number)} options={drafts.map(d => ({ label: `Ch. ${d.chapter}`, value: d.chapter }))} />}
                </Flex>
              }
            >
              <div style={{ border: `1.5px solid ${nf.tealBorder}`, background: nf.tealBg, borderRadius: 8, padding: 16, minHeight: 240 }}>
                {shown ? (
                  <Text style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.8 }}>{shown}</Text>
                ) : (
                  <Text type="secondary">No draft yet for this chapter. Use “Generate next chapter” to produce one.</Text>
                )}
              </div>
              {focus !== undefined && (
                <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
                  <Button icon={<EditOutlined />} onClick={() => navigate({ to: '/novels/$novelId/chapter-editor', params: { novelId } })}>
                    Edit
                  </Button>
                  <Button type="primary" icon={<CheckOutlined />} onClick={() => navigate({ to: '/novels/$novelId/chapter-review', params: { novelId } })}>
                    Send to review
                  </Button>
                </Flex>
              )}
            </Card>
          </Col>
        </Row>
      </QueryState>
    </div>
  );
}

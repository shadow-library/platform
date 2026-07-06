/**
 * Importing npm packages
 */
import { ArrowLeftOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { App, Button, Card, Col, Form, Input, Row, Select, Tag, Typography } from 'antd';
import { useEffect } from 'react';

/**
 * Importing user defined modules
 */
import { AssetBox, PageHeader, QueryState } from '@/components/nf';
import { useEntityQuery, useUpdateEntityMutation, type UpdateEntityBody } from '@/lib/apis';
import { coverColor } from '@/lib/format';

const { Title } = Typography;

export const Route = createFileRoute('/novels/$novelId/character/$characterId')({
  component: CharacterDetail,
});

function CharacterDetail() {
  const { novelId, characterId } = Route.useParams();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<UpdateEntityBody>();

  const entityQuery = useEntityQuery(novelId, characterId);
  const updateEntity = useUpdateEntityMutation(novelId, characterId);
  const entity = entityQuery.data;

  useEffect(() => {
    if (entity) form.setFieldsValue({ name: entity.name, significance: entity.significance, status: entity.status ?? undefined, notes: entity.notes ?? undefined, motivation: entity.motivation ?? undefined, body: entity.body ?? undefined });
  }, [entity, form]);

  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    updateEntity.mutate(values, {
      onSuccess: () => message.success('Character saved'),
      onError: err => message.error(err.message),
    });
  };

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate({ to: '/novels/$novelId/characters', params: { novelId } })} style={{ marginBottom: 12, paddingInline: 0 }}>
        Characters
      </Button>

      <QueryState isLoading={entityQuery.isLoading} error={entityQuery.error} isEmpty={!entity} emptyText="Character not found">
        <Row gutter={16}>
          <Col xs={24} md={7}>
            <Card>
              <AssetBox height={200} color={coverColor(characterId)} />
              {entity?.significance === 'major' && (
                <Tag color="cyan" style={{ marginTop: 12 }}>
                  Major character
                </Tag>
              )}
              {entity?.firstSeenChapter ? (
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                  First seen in Chapter {entity.firstSeenChapter}
                </Typography.Paragraph>
              ) : null}
            </Card>
          </Col>

          <Col xs={24} md={17}>
            <PageHeader
              title={<Title level={3} style={{ margin: 0 }}>{entity?.name}</Title>}
              extra={
                <Button type="primary" loading={updateEntity.isPending} onClick={save}>
                  Save
                </Button>
              }
            />
            <Card>
              <Form form={form} layout="vertical" requiredMark={false}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Name" name="name">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label="Significance" name="significance">
                      <Select options={[{ label: 'Major', value: 'major' }, { label: 'Minor', value: 'minor' }]} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label="Status" name="status">
                      <Input placeholder="alive, exiled…" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Motivation" name="motivation">
                  <Input.TextArea rows={2} placeholder="What drives them" />
                </Form.Item>
                <Form.Item label="Notes" name="notes">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item label="Profile" name="body">
                  <Input.TextArea rows={5} placeholder="Full character profile / backstory" />
                </Form.Item>
              </Form>
            </Card>
          </Col>
        </Row>
      </QueryState>
    </div>
  );
}

/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { Avatar, Button, Card, Col, Flex, Form, Input, Progress, Row, Space, Switch, Tag, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader } from '@/components/nf';
import { useTheme } from '@/components/AppProvider';

const { Text, Title } = Typography;

export const Route = createFileRoute('/_app/profile')({
  component: Profile,
});

function Profile() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="Profile" />

      <Card style={{ marginBottom: 16 }}>
        <Flex align="center" gap={16}>
          <Avatar size={64} style={{ backgroundColor: 'var(--color-primary)', fontSize: 24 }}>
            JD
          </Avatar>
          <div style={{ flex: 1 }}>
            <Title level={4} style={{ margin: 0 }}>
              John Doe
            </Title>
            <Text type="secondary">Novelist · joined 2024</Text>
          </div>
          <Button>Edit</Button>
        </Flex>
      </Card>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title="Account">
          <Form layout="vertical" initialValues={{ name: 'John Doe', email: 'john.doe@example.com' }} requiredMark={false}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Name" name="name">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Email" name="email">
                  <Input />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>

        <Card title="Plan & usage">
          <Flex align="center" gap={10} style={{ marginBottom: 12 }}>
            <Tag color="cyan">Pro</Tag>
            <Text type="secondary">Renews July 28, 2026</Text>
          </Flex>
          <Text type="secondary">AI words this month</Text>
          <Progress percent={48} strokeColor="var(--color-primary)" format={p => `${p}% of 500k`} />
        </Card>

        <Card title="Preferences">
          <Flex align="center" justify="space-between">
            <Text>Dark mode</Text>
            <Switch checked={theme === 'dark'} onChange={toggleTheme} />
          </Flex>
        </Card>
      </Space>
    </div>
  );
}

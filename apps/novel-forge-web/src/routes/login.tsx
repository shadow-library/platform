/**
 * Importing npm packages
 */
import { GoogleOutlined } from '@ant-design/icons';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Divider, Flex, Form, Input, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import Logo from '@/components/Logo';

const { Title, Text, Link } = Typography;

export const Route = createFileRoute('/login')({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const signIn = () => navigate({ to: '/' });

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', background: 'var(--color-bg-layout)', padding: 24 }}>
      <Flex vertical align="center" gap={18} style={{ width: 360, maxWidth: '100%' }}>
        <Logo width={200} />
        <div style={{ textAlign: 'center' }}>
          <Title level={3} style={{ marginBottom: 2 }}>
            Novel Forge
          </Title>
          <Text type="secondary">Create your next novel</Text>
        </div>

        <Card style={{ width: '100%' }}>
          <Form layout="vertical" onFinish={signIn} requiredMark={false}>
            <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter your email' }]}>
              <Input placeholder="you@example.com" size="large" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Enter your password' }]}>
              <Input.Password placeholder="••••••••" size="large" />
            </Form.Item>
            <Flex justify="flex-end" style={{ marginBottom: 12 }}>
              <Link>Forgot password?</Link>
            </Flex>
            <Button type="primary" htmlType="submit" size="large" block>
              Sign in
            </Button>
            <Divider plain style={{ margin: '16px 0' }}>
              <Text type="secondary">or</Text>
            </Divider>
            <Button size="large" block icon={<GoogleOutlined />} onClick={signIn}>
              Continue with SSO
            </Button>
          </Form>
        </Card>

        <Text type="secondary">
          New here? <Link>Create an account</Link>
        </Text>
      </Flex>
    </Flex>
  );
}

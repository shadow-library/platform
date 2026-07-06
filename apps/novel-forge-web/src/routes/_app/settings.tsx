/**
 * Importing npm packages
 */
import { FileMarkdownOutlined, FileTextOutlined, FileWordOutlined } from '@ant-design/icons';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Card, Flex, Form, InputNumber, Segmented, Space, Switch, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { PageHeader } from '@/components/nf';

const { Text } = Typography;

export const Route = createFileRoute('/_app/settings')({
  component: Settings,
});

function SettingRow({ label, hint, control }: { label: string; hint?: string; control: React.ReactNode }) {
  return (
    <Flex align="center" justify="space-between" gap={16} style={{ padding: '10px 0' }}>
      <div>
        <Text>{label}</Text>
        {hint && (
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {hint}
          </Text>
        )}
      </div>
      {control}
    </Flex>
  );
}

function Settings() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Studio-wide defaults for AI generation, canon rules, and exports." />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Card title="Default model & creativity">
          <Segmented defaultValue="Balanced" options={['Precise', 'Balanced', 'Creative']} />
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            Applied to new generations unless a chapter overrides it.
          </Text>
        </Card>

        <Card title="Generation defaults" styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}>
          <SettingRow
            label="Target length per chapter"
            hint="Guides brief and draft generation."
            control={
              <Form.Item noStyle>
                <InputNumber defaultValue={3000} step={250} min={500} suffix="words" />
              </Form.Item>
            }
          />
          <SettingRow label="Auto-extract lore from new drafts" hint="Surface new facts to the approval queue." control={<Switch defaultChecked />} />
        </Card>

        <Card title="Canon rules" styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}>
          <SettingRow label="Require approval before anything becomes canon" hint="Nothing enters the Story Bible without your sign-off." control={<Switch defaultChecked />} />
          <SettingRow label="Auto-run continuity check on every new draft" control={<Switch />} />
        </Card>

        <Card title="Export">
          <Space wrap>
            <Button icon={<FileTextOutlined />}>EPUB</Button>
            <Button icon={<FileWordOutlined />}>DOCX</Button>
            <Button icon={<FileMarkdownOutlined />}>Markdown</Button>
          </Space>
        </Card>
      </Space>
    </div>
  );
}

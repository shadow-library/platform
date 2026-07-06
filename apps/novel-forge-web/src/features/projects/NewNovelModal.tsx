/**
 * Importing npm packages
 */
import { App, Flex, Form, Input, Modal, Segmented, Typography } from 'antd';

/**
 * Importing user defined modules
 */
import { AiTag } from '@/components/nf';
import { nf } from '@/constants';
import { useCreateProjectMutation, type CreateProjectBody, type ProjectResponse } from '@/lib/apis';

const { Text } = Typography;

interface FormValues {
  title: string;
  kind: CreateProjectBody['kind'];
  contentMode: NonNullable<CreateProjectBody['contentMode']>;
  url?: string;
}

export interface NewNovelModalProps {
  open: boolean;
  onCancel: () => void;
  onCreated: (project: ProjectResponse) => void;
}

/** The "New novel" modal (wireframe 1e), wired to POST /projects. */
export function NewNovelModal({ open, onCancel, onCreated }: NewNovelModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const createProject = useCreateProjectMutation();
  const kind = Form.useWatch('kind', form);

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const body: CreateProjectBody = {
      name: values.title,
      title: values.title,
      kind: values.kind,
      contentMode: values.contentMode,
      ...(values.kind === 'source' && values.url ? { url: values.url } : {}),
    };
    createProject.mutate(body, {
      onSuccess: project => {
        message.success(`Created “${project.title || project.name}”`);
        onCancel();
        form.resetFields();
        onCreated(project);
      },
      onError: err => message.error(err.message),
    });
  };

  return (
    <Modal
      title="Start a new novel"
      open={open}
      onCancel={onCancel}
      okText="Create novel"
      confirmLoading={createProject.isPending}
      onOk={submit}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: 'new_novel', contentMode: 'standard' }} style={{ marginTop: 8 }}>
        <Form.Item label="Working title" name="title" rules={[{ required: true, message: 'Give your novel a working title' }]}>
          <Input placeholder="e.g. The Ashfall Chronicles" />
        </Form.Item>
        <Form.Item label="Kind" name="kind">
          <Segmented
            block
            options={[
              { label: 'Original novel', value: 'new_novel' },
              { label: 'Adapt from source', value: 'source' },
            ]}
          />
        </Form.Item>
        {kind === 'source' && (
          <Form.Item label="Source URL" name="url" rules={[{ required: true, type: 'url', message: 'Enter the URL to adapt from' }]}>
            <Input placeholder="https://…" />
          </Form.Item>
        )}
        <Form.Item label="Content mode" name="contentMode">
          <Segmented
            block
            options={[
              { label: 'Standard', value: 'standard' },
              { label: 'Grok only', value: 'grok_only' },
            ]}
          />
        </Form.Item>
        <div style={{ border: `1.5px dashed ${nf.tealBorder}`, background: nf.tealBg, borderRadius: 8, padding: 12 }}>
          <Flex align="center" gap={8}>
            <AiTag>AI</AiTag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              After creating, open the novel and run <Text strong>Plan</Text> to have AI draft the Story Bible, cast, and outline.
            </Text>
          </Flex>
        </div>
      </Form>
    </Modal>
  );
}

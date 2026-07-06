/**
 * Importing npm packages
 */
import { SaveOutlined } from '@ant-design/icons';
import { App, Alert, Button, Card, Flex, Input, Spin } from 'antd';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { useBibleDocQuery, useUpsertBibleDocMutation, type BibleSection } from '@/lib/apis';

export interface BibleDocEditorProps {
  projectId: string;
  section: BibleSection;
  slug: string;
  placeholder?: string;
}

/**
 * Fetch-and-edit a single Story Bible document. A missing document (404) is a
 * normal state — the editor starts blank and the first save creates it.
 */
export function BibleDocEditor({ projectId, section, slug, placeholder = 'Write this section…' }: BibleDocEditorProps) {
  const { message } = App.useApp();
  const query = useBibleDocQuery(projectId, section, slug);
  const upsert = useUpsertBibleDocMutation(projectId, section, slug);
  const [body, setBody] = useState('');

  const missing = query.error?.status === 404;

  useEffect(() => {
    if (query.data) setBody(query.data.body ?? '');
  }, [query.data]);

  if (query.isLoading)
    return (
      <Flex justify="center" style={{ padding: 48 }}>
        <Spin />
      </Flex>
    );
  if (query.error && !missing) return <Alert type="error" showIcon title="Couldn’t load this section" description={query.error.message} />;

  return (
    <Card>
      {missing && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Not written yet — start typing and save to create this section." />}
      <Input.TextArea value={body} onChange={e => setBody(e.target.value)} autoSize={{ minRows: 12 }} placeholder={placeholder} style={{ fontSize: 15, lineHeight: 1.8 }} />
      <Flex justify="flex-end" style={{ marginTop: 16 }}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={upsert.isPending}
          onClick={() => upsert.mutate({ body }, { onSuccess: () => message.success('Saved'), onError: e => message.error(e.message) })}
        >
          Save
        </Button>
      </Flex>
    </Card>
  );
}

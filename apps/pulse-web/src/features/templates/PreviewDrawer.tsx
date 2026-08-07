import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Alert, Button, FormField, Input, Select, Textarea } from '@shadow-library/ui';

import { CHANNEL_OPTIONS, type ViewerData, ViewerDrawer } from '@/features/shared';
import { type NotificationChannel, usePreviewMutation } from '@/lib';

interface PreviewDrawerProps {
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: NotificationChannel[];
}

const DEFAULT_LOCALE = 'en-ZZ';

export default function PreviewDrawer({ templateId, open, onOpenChange, channels }: PreviewDrawerProps): ReactElement {
  const available = channels.length > 0 ? channels : CHANNEL_OPTIONS.map(option => option.value);
  const [channel, setChannel] = useState<NotificationChannel>(available[0] ?? 'EMAIL');
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [payload, setPayload] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState<ViewerData | null>(null);
  const mutation = usePreviewMutation(templateId);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setData(null);
      setError('');
    }
    wasOpen.current = open;
  }, [open]);

  const render = (): void => {
    let sample: Record<string, unknown> | undefined;
    if (payload.trim()) {
      try {
        sample = JSON.parse(payload);
      } catch {
        setData(null);
        return setError('Payload is not valid JSON.');
      }
    }
    setError('');
    const trimmedLocale = locale.trim() || DEFAULT_LOCALE;
    mutation.mutate(
      { channel, locale: trimmedLocale, data: sample },
      {
        onSuccess: result =>
          setData({
            channel,
            title: `Preview · ${channel}`,
            meta: trimmedLocale,
            subject: result.subject ?? undefined,
            body: result.body,
            rawSubject: result.subject ?? undefined,
            rawBody: result.body,
            payload: sample ?? null,
          }),
        onError: apiError => {
          setData(null);
          setError(apiError.message);
        },
      },
    );
  };

  const controls = (
    <>
      <FormField label="Channel">
        <Select value={channel} onValueChange={value => setChannel(value as NotificationChannel)} aria-label="Preview channel">
          {CHANNEL_OPTIONS.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      <FormField label="Locale">
        <Input value={locale} onValueChange={setLocale} placeholder={DEFAULT_LOCALE} />
      </FormField>
      <FormField label="Sample data" optional helper="JSON values for the declared variables.">
        <Textarea value={payload} onValueChange={setPayload} minRows={4} placeholder={'{ "firstName": "Ada" }'} />
      </FormField>
      {error ? (
        <Alert intent="danger" title="Couldn't render preview">
          {error}
        </Alert>
      ) : null}
      <Button variant="primary" onClick={render} loading={mutation.isPending}>
        Render preview
      </Button>
    </>
  );

  return (
    <ViewerDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Live preview"
      meta={templateId}
      data={data}
      controls={controls}
      placeholder="Render to preview the draft or published content."
    />
  );
}

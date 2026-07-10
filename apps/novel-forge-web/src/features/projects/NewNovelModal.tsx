/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, Input, SegmentedControl, toast } from '@shadow-library/ui';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { AiTag } from '@/components/nf';
import { type CreateProjectBody, type ProjectResponse, useCreateProjectMutation } from '@/lib/apis';

type Kind = CreateProjectBody['kind'];
type Mode = NonNullable<CreateProjectBody['contentMode']>;

export interface NewNovelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectResponse) => void;
  initialKind?: Kind;
}

/** The "New novel" dialog, wired to POST /projects. */
export function NewNovelModal({ open, onOpenChange, onCreated, initialKind = 'new_novel' }: NewNovelModalProps): React.JSX.Element {
  const createProject = useCreateProjectMutation();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>(initialKind);
  const [contentMode, setContentMode] = useState<Mode>('standard');
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);

  const titleError = touched && !title.trim() ? 'Give your novel a working title' : undefined;
  const urlError = touched && kind === 'source' && !url.trim() ? 'Enter the URL to adapt from' : undefined;

  const reset = (): void => {
    setTitle('');
    setKind(initialKind);
    setContentMode('standard');
    setUrl('');
    setTouched(false);
  };

  const submit = (): void => {
    setTouched(true);
    if (!title.trim() || (kind === 'source' && !url.trim())) return;
    const body: CreateProjectBody = {
      name: title.trim(),
      title: title.trim(),
      kind,
      contentMode,
      ...(kind === 'source' && url.trim() ? { url: url.trim() } : {}),
    };
    createProject.mutate(body, {
      onSuccess: project => {
        toast.success(`Created “${project.title || project.name}”`);
        onOpenChange(false);
        reset();
        onCreated?.(project);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Content size="md">
        <Dialog.Header title="Start a new novel" description="Create an original novel or adapt one from a source." />
        <Dialog.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormField label="Working title" required error={titleError}>
              <Input placeholder="e.g. The Ashfall Chronicles" value={title} onValueChange={setTitle} invalid={Boolean(titleError)} autoFocus />
            </FormField>
            <FormField label="Kind">
              <SegmentedControl value={kind} onValueChange={v => setKind(v as Kind)} fullWidth>
                <SegmentedControl.Item value="new_novel">Original novel</SegmentedControl.Item>
                <SegmentedControl.Item value="source">Adapt from source</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            {kind === 'source' && (
              <FormField label="Source URL" required error={urlError}>
                <Input placeholder="https://…" value={url} onValueChange={setUrl} invalid={Boolean(urlError)} />
              </FormField>
            )}
            <FormField label="Content mode">
              <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as Mode)} fullWidth>
                <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                <SegmentedControl.Item value="grok_only">Grok only</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            <div style={{ border: '1.5px dashed var(--sh-accent-soft)', background: 'var(--sh-accent-soft)', borderRadius: 'var(--sh-radius-md)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AiTag>AI</AiTag>
                <span style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-secondary)' }}>
                  After creating, open the novel and run <strong>Plan</strong> to have AI draft the Story Bible, cast, and outline.
                </span>
              </div>
            </div>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={createProject.isPending} onClick={submit}>
            Create novel
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

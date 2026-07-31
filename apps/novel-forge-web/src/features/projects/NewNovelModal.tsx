/**
 * Importing npm packages
 */
import { useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { AiTag } from '@/components/nf';
import { type CreateProjectBody, type ProjectResponse, useCreateProjectMutation } from '@/lib/apis';

import styles from './NewNovelModal.module.css';

type Mode = NonNullable<CreateProjectBody['contentMode']>;

export interface NewNovelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectResponse) => void;
}

/**
 * The "New novel" dialog, wired to POST /projects. Always creates a `new_novel` project — chapters for a
 * `source`-kind project only ever arrive through a novel-import bundle (see the "Import novel" screen),
 * which creates its own project, so there is nothing this manual dialog could usefully create for that
 * kind.
 */
export function NewNovelModal({ open, onOpenChange, onCreated }: NewNovelModalProps): React.JSX.Element {
  const createProject = useCreateProjectMutation();
  const [title, setTitle] = useState('');
  const [contentMode, setContentMode] = useState<Mode>('standard');
  const [touched, setTouched] = useState(false);

  const titleError = touched && !title.trim() ? 'Give your novel a working title' : undefined;

  const reset = (): void => {
    setTitle('');
    setContentMode('standard');
    setTouched(false);
  };

  const submit = (): void => {
    setTouched(true);
    if (!title.trim()) return;
    const body: CreateProjectBody = {
      name: title.trim(),
      title: title.trim(),
      kind: 'new_novel',
      contentMode,
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
        <Dialog.Header title="Start a new novel" description="Create an original novel from a premise. To adapt an existing manuscript, use Import novel instead." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Working title" required error={titleError}>
              <Input placeholder="e.g. The Ashfall Chronicles" value={title} onValueChange={setTitle} invalid={Boolean(titleError)} autoFocus />
            </FormField>
            <FormField label="Content mode">
              <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as Mode)} fullWidth>
                <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                <SegmentedControl.Item value="grok_only">Grok only</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            <div className={styles.hint}>
              <div className={styles.hintRow}>
                <AiTag>AI</AiTag>
                <span className={styles.hintText}>
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

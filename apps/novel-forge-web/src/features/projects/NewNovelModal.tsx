import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl, toast } from '@shadow-library/ui';

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
 * The "New novel" dialog: always creates a `new_novel` project, which opens straight into the Workspace
 * chat. Continuing an existing manuscript is a separate door (the "Import novel" screen, novel-import
 * `final` mode) this dialog only points to rather than duplicates.
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
        <Dialog.Header
          title="Start a new novel"
          description={
            <>
              Creates the project and opens its Workspace chat, where you and the assistant design the Story Bible together. To continue an existing manuscript, use{' '}
              <Link to="/import">Import novel</Link> instead.
            </>
          }
        />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Working title" required error={titleError}>
              <Input placeholder="e.g. The Ashfall Chronicles" value={title} onValueChange={setTitle} invalid={Boolean(titleError)} autoFocus />
            </FormField>
            <FormField label="Content mode" helper="Unrestricted uses the alternate model map. Standard uses the default quality stack.">
              <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as Mode)} fullWidth>
                <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                <SegmentedControl.Item value="unrestricted">Unrestricted</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            <div className={styles.hint}>
              <div className={styles.hintRow}>
                <AiTag>AI</AiTag>
                <span className={styles.hintText}>The novel opens in the Workspace chat — write chapters yourself, or ask the assistant to help plan and draft them.</span>
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

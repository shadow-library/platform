import { useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl, Textarea, toast } from '@shadow-library/ui';

import { AiTag } from '@/components/nf';
import { type CreateProjectBody, type ProjectResponse, type SeedResponse, useCreateProjectMutation, useCreateSeedMutation } from '@/lib/apis';

import styles from './NewNovelModal.module.css';

type Mode = NonNullable<CreateProjectBody['contentMode']>;

/** The two ways into a novel: the studio interviews an idea into shape, or the author already knows the book. */
type Door = 'idea' | 'direct';

export interface NewNovelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectResponse) => void;
  onSeedCreated?: (seed: SeedResponse) => void;
  defaultDoor?: Door;
}

/**
 * The "New novel" dialog. The direct door always creates a `new_novel` project — chapters for a `source`-kind
 * project only ever arrive through a novel-import bundle (see the "Import novel" screen), which creates its
 * own project, so there is nothing this manual dialog could usefully create for that kind. The idea door
 * creates a seed instead and hands the author to the Ideation Studio.
 */
export function NewNovelModal({ open, onOpenChange, onCreated, onSeedCreated, defaultDoor = 'direct' }: NewNovelModalProps): React.JSX.Element {
  const createProject = useCreateProjectMutation();
  const createSeed = useCreateSeedMutation();
  const [door, setDoor] = useState<Door>(defaultDoor);
  const [title, setTitle] = useState('');
  const [spark, setSpark] = useState('');
  const [contentMode, setContentMode] = useState<Mode>('standard');
  const [touched, setTouched] = useState(false);

  const titleError = touched && !title.trim() ? 'Give your novel a working title' : undefined;

  const reset = (): void => {
    setDoor(defaultDoor);
    setTitle('');
    setSpark('');
    setContentMode('standard');
    setTouched(false);
  };

  const submitDirect = (): void => {
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

  const submitIdea = (): void => {
    createSeed.mutate(
      { spark: spark.trim() || undefined, contentMode },
      {
        onSuccess: seed => {
          onOpenChange(false);
          reset();
          onSeedCreated?.(seed);
        },
        onError: err => toast.danger(err.message),
      },
    );
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
            door === 'idea'
              ? 'The studio asks the questions a developmental editor would, and keeps a story seed sheet as you answer.'
              : 'Create an original novel from a premise. To adapt an existing manuscript, use Import novel instead.'
          }
        />
        <Dialog.Body>
          <div className={styles.form}>
            <SegmentedControl value={door} onValueChange={v => setDoor(v as Door)} fullWidth>
              <SegmentedControl.Item value="idea">Start from an idea</SegmentedControl.Item>
              <SegmentedControl.Item value="direct">I know the novel</SegmentedControl.Item>
            </SegmentedControl>
            {door === 'idea' ? (
              <>
                <FormField
                  label="Content mode"
                  helper="Unrestricted uses models that will write adult and otherwise blocked material. Standard uses the default quality stack, which refuses or sanitises this."
                >
                  <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as Mode)} fullWidth>
                    <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                    <SegmentedControl.Item value="unrestricted">Unrestricted</SegmentedControl.Item>
                  </SegmentedControl>
                </FormField>
                <FormField label="The spark" helper="Optional — a sentence, a paragraph, or nothing at all. The studio starts from whatever you have.">
                  <Textarea
                    placeholder="e.g. a salvager who can hear what drowned ships remember"
                    value={spark}
                    onValueChange={setSpark}
                    minRows={3}
                    maxRows={8}
                    autoGrow
                    autoFocus
                  />
                </FormField>
                <div className={styles.hint}>
                  <div className={styles.hintRow}>
                    <AiTag>AI</AiTag>
                    <span className={styles.hintText}>
                      You answer questions and pick between concepts; the sheet fills in as you go. Nothing is a novel until you press <strong>Start the novel</strong>.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <FormField label="Working title" required error={titleError}>
                  <Input placeholder="e.g. The Ashfall Chronicles" value={title} onValueChange={setTitle} invalid={Boolean(titleError)} autoFocus />
                </FormField>
                <FormField
                  label="Content mode"
                  helper="Unrestricted uses models that will write adult and otherwise blocked material. Standard uses the default quality stack, which refuses or sanitises this."
                >
                  <SegmentedControl value={contentMode} onValueChange={v => setContentMode(v as Mode)} fullWidth>
                    <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
                    <SegmentedControl.Item value="unrestricted">Unrestricted</SegmentedControl.Item>
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
              </>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          {door === 'idea' ? (
            <Button variant="primary" loading={createSeed.isPending} onClick={submitIdea}>
              Open the studio
            </Button>
          ) : (
            <Button variant="primary" loading={createProject.isPending} onClick={submitDirect}>
              Create novel
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

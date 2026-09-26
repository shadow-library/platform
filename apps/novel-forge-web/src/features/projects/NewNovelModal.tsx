import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl, toast } from '@shadow-library/ui';

import { AiTag } from '@/components/nf';
import { type CreateProjectBody, type ProjectResponse, useCreateProjectMutation } from '@/lib/apis';

import styles from './NewNovelModal.module.css';

type Mode = NonNullable<CreateProjectBody['contentMode']>;

/**
 * The ways into a novel: the Blueprint designs one from nothing, the author already knows the book, or a
 * plan bundle authored offline is ready to load. The import door only creates the project — the bundle
 * itself is uploaded on the Import Plan screen this door hands off to, since that screen already owns the
 * upload/preview/overwrite/approve flow.
 */
type Door = 'blueprint' | 'direct' | 'import';

export interface NewNovelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectResponse) => void;
  defaultDoor?: Door;
}

/**
 * The "New novel" dialog. The direct door always creates a `new_novel` project — continuing an existing
 * manuscript only ever arrives through a novel-import bundle (see the "Import novel" screen), which
 * creates its own project, so there is nothing this manual dialog could usefully create for that case.
 * The import door creates a `new_novel` project — plan import only ever applies to that kind — then routes
 * to its Import Plan screen to upload the bundle.
 */
export function NewNovelModal({ open, onOpenChange, onCreated, defaultDoor = 'blueprint' }: NewNovelModalProps): React.JSX.Element {
  const navigate = useNavigate();
  const createProject = useCreateProjectMutation();
  const [door, setDoor] = useState<Door>(defaultDoor);
  const [title, setTitle] = useState('');
  const [contentMode, setContentMode] = useState<Mode>('standard');
  const [touched, setTouched] = useState(false);

  const titleError = touched && !title.trim() ? 'Give your novel a working title' : undefined;

  const reset = (): void => {
    setDoor(defaultDoor);
    setTitle('');
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

  const submitBlueprint = (): void => {
    const name = title.trim() || 'Untitled novel';
    createProject.mutate(
      { name, ...(title.trim() ? { title: name } : {}), kind: 'new_novel', contentMode },
      {
        onSuccess: project => {
          onOpenChange(false);
          reset();
          void navigate({ to: '/novels/$novelId/blueprint', params: { novelId: project.id } });
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const submitImportPlan = (): void => {
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
        toast.success(`Created “${project.title || project.name}” — now import your plan bundle`);
        onOpenChange(false);
        reset();
        void navigate({ to: '/novels/$novelId/import-plan', params: { novelId: project.id } });
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
            door === 'blueprint'
              ? 'Seven guided phases from an idea to a novel ready to write: the book as a whole, then its engine, its shape, and its first chapters. You don’t need an idea yet.'
              : door === 'import'
                ? 'Create the project, then upload a plan bundle authored offline — bible documents, entities, volumes, arcs and chapter briefs land in one transactional call.'
                : 'Create an original novel from a premise. To continue an existing manuscript, use Import novel instead.'
          }
        />
        <Dialog.Body>
          <div className={styles.form}>
            <SegmentedControl value={door} onValueChange={v => setDoor(v as Door)} fullWidth>
              <SegmentedControl.Item value="blueprint">Design a new novel</SegmentedControl.Item>
              <SegmentedControl.Item value="direct">I know the novel</SegmentedControl.Item>
              <SegmentedControl.Item value="import">Import a plan</SegmentedControl.Item>
            </SegmentedControl>
            {door === 'blueprint' ? (
              <>
                <FormField label="Working name" helper="Optional — the Title step in Heart helps you name it properly.">
                  <Input placeholder="Untitled novel" value={title} onValueChange={setTitle} autoFocus />
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
                    <span className={styles.hintText}>
                      The novel exists from the first click: everything you decide is its own data. Roughly 3–5 hours over several sittings, and you can stop at any phase.
                    </span>
                  </div>
                </div>
              </>
            ) : door === 'import' ? (
              <>
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
                  <span className={styles.hintText}>
                    Creates the project, then opens Import Plan so you can upload the bundle — bible documents, entities, volumes, arcs and chapter briefs land in one transactional
                    call.
                  </span>
                </div>
              </>
            ) : (
              <>
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
          {door === 'blueprint' ? (
            <Button variant="primary" loading={createProject.isPending} onClick={submitBlueprint}>
              Create and start
            </Button>
          ) : door === 'import' ? (
            <Button variant="primary" loading={createProject.isPending} onClick={submitImportPlan}>
              Create &amp; import
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

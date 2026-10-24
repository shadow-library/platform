import { type ReactElement, useState } from 'react';
import { DescriptionList, FormField, Select } from '@shadow-library/ui';

import { type CatalogDocument, type Effort, EFFORTS, type TaskEntry } from '@/features/catalog';
import { effortName, Muted } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { type EffortForm, effortFormOf, effortProblems, hasEffortProblems } from './effort-range';
import { featureNote } from './feature-detail';
import styles from './Features.module.css';
import { effortEdit } from './section-edits';
import { EditorDrawer, SectionCard, type SectionEditor, useSectionEditor } from './SectionEditor';

interface EffortSectionProps {
  task: TaskEntry;
  document: CatalogDocument;
  canEdit: boolean;
}

const EXPLANATION = 'How hard the model thinks before answering; higher costs more and is slower.';
const UNSET = '__unset';

const isEffort = (value: string): value is Effort => (EFFORTS as readonly string[]).includes(value);
const choiceOf = (value: string): Effort | null => (isEffort(value) ? value : null);

export function EffortSection({ task, document, canEdit }: EffortSectionProps): ReactElement {
  const editor = useSectionEditor(task.key, document, 'effort');
  if (task.kind !== 'chat')
    return (
      <SectionCard title="Effort" subtitle={EXPLANATION} editor={editor}>
        <p className={controls.hint}>Effort applies only to chat features.</p>
      </SectionCard>
    );
  const effort = task.effort;
  return (
    <SectionCard title="Effort" subtitle={EXPLANATION} editor={editor} editLabel={canEdit ? 'Edit effort' : undefined}>
      {effort ? (
        <DescriptionList>
          <DescriptionList.Item term="Default">{effortName(effort.default)}</DescriptionList.Item>
          <DescriptionList.Item term="Lowest allowed">{effort.min ? effortName(effort.min) : <Muted>No limit</Muted>}</DescriptionList.Item>
          <DescriptionList.Item term="Highest allowed">{effort.max ? effortName(effort.max) : <Muted>No limit</Muted>}</DescriptionList.Item>
        </DescriptionList>
      ) : (
        <p className={controls.hint}>No effort setting: Synapse sends one only when the app asks for it.</p>
      )}
      <EffortDrawer key={editor.session} task={task} editor={editor} />
    </SectionCard>
  );
}

function EffortSelect({ value, onChange, unsetLabel, label }: { value: Effort | null; onChange: (next: Effort | null) => void; unsetLabel: string; label: string }): ReactElement {
  return (
    <Select value={value ?? UNSET} onValueChange={next => onChange(choiceOf(next))} aria-label={label}>
      <Select.Item value={UNSET}>{unsetLabel}</Select.Item>
      {EFFORTS.map(effort => (
        <Select.Item key={effort} value={effort}>
          {effortName(effort)}
        </Select.Item>
      ))}
    </Select>
  );
}

function EffortDrawer({ task, editor }: { task: TaskEntry; editor: SectionEditor }): ReactElement {
  const [opened] = useState<EffortForm>(() => effortFormOf(task.effort));
  const [form, setForm] = useState<EffortForm>(opened);
  const problems = effortProblems(form);
  const bounded = form.default !== null;
  const save = (): void => void editor.save(effortEdit(task.key, opened, form), featureNote(task, 'effort updated'));
  return (
    <EditorDrawer title="Effort" meta={EXPLANATION} editor={editor} canSave={!hasEffortProblems(problems)} onSave={save}>
      <FormField label="Default" helper="Used when the app asks for no particular effort.">
        <EffortSelect label="Default effort" value={form.default} unsetLabel="No effort setting" onChange={next => setForm(current => ({ ...current, default: next }))} />
      </FormField>
      {bounded ? (
        <div className={styles.effortBounds}>
          <FormField label="Lowest allowed" error={problems.min}>
            <EffortSelect label="Lowest allowed effort" value={form.min} unsetLabel="No limit" onChange={next => setForm(current => ({ ...current, min: next }))} />
          </FormField>
          <FormField label="Highest allowed" error={problems.max}>
            <EffortSelect label="Highest allowed effort" value={form.max} unsetLabel="No limit" onChange={next => setForm(current => ({ ...current, max: next }))} />
          </FormField>
        </div>
      ) : (
        <p className={controls.hint}>Without a default, Synapse sends an effort only when the app asks for one, and sets no limits on it.</p>
      )}
      <p className={controls.hint}>
        An app may ask for a different effort; Synapse keeps it between the lowest and highest. A model that doesn&apos;t support that effort gets none, or its lowest if it always
        reasons.
      </p>
    </EditorDrawer>
  );
}

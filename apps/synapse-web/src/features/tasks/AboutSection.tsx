import { type ReactElement, useState } from 'react';
import { DescriptionList, FormField, Input, Textarea } from '@shadow-library/ui';

import { type CatalogDocument, type TaskEntry } from '@/features/catalog';
import { Muted, sentenceCase, taskName } from '@/features/shared';

import { type AboutForm, aboutProblems, featureNote, TASK_DESCRIPTION_MAX, TASK_LABEL_MAX } from './feature-detail';
import { aboutEdit } from './section-edits';
import { EditorDrawer, SectionCard, type SectionEditor, useSectionEditor } from './SectionEditor';

interface AboutSectionProps {
  task: TaskEntry;
  document: CatalogDocument;
  canEdit: boolean;
}

export function AboutSection({ task, document, canEdit }: AboutSectionProps): ReactElement {
  const editor = useSectionEditor(task.key, document, 'about');
  return (
    <SectionCard title="About" subtitle="How this feature is named across the console." editor={editor} editLabel={canEdit ? 'Edit name and description' : undefined}>
      <DescriptionList>
        <DescriptionList.Item term="Name">{taskName(task)}</DescriptionList.Item>
        <DescriptionList.Item term="Description">{task.description ? task.description : <Muted>No description</Muted>}</DescriptionList.Item>
      </DescriptionList>
      <AboutDrawer key={editor.session} task={task} editor={editor} />
    </SectionCard>
  );
}

function AboutDrawer({ task, editor }: { task: TaskEntry; editor: SectionEditor }): ReactElement {
  const [opened] = useState<AboutForm>(() => ({ label: task.label ?? '', description: task.description ?? '' }));
  const [form, setForm] = useState<AboutForm>(opened);
  const problems = aboutProblems(form);
  const save = (): void => void editor.save(aboutEdit(task.key, opened, form), featureNote(task, 'details updated'));
  return (
    <EditorDrawer title="About this feature" editor={editor} canSave={!problems.label && !problems.description} onSave={save}>
      <FormField label="Name" helper={`Leave blank to use "${sentenceCase(task.name)}".`} error={problems.label} optional>
        <Input value={form.label} onValueChange={label => setForm(current => ({ ...current, label }))} placeholder={sentenceCase(task.name)} maxLength={TASK_LABEL_MAX} />
      </FormField>
      <FormField label="Description" helper="One or two sentences on what the feature does for people." error={problems.description} optional>
        <Textarea
          value={form.description}
          onValueChange={description => setForm(current => ({ ...current, description }))}
          maxLength={TASK_DESCRIPTION_MAX}
          showCount
          minRows={3}
        />
      </FormField>
    </EditorDrawer>
  );
}

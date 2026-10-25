import { type ReactElement, useState } from 'react';
import { Alert, FormField, MultiSelect, Tag } from '@shadow-library/ui';

import { type CatalogDocument, type TaskEntry } from '@/features/catalog';
import { aliasName } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { aliasHints, aliasOptions, type FeatureContext } from './feature-detail';
import styles from './Features.module.css';
import { aliasesEdit } from './section-edits';
import { EditorDrawer, SectionCard, type SectionEditor, useSectionEditor } from './SectionEditor';

interface AliasesSectionProps {
  task: TaskEntry;
  document: CatalogDocument;
  context: FeatureContext;
  canEdit: boolean;
}

const SUBTITLE = 'The model names people may pick for this feature, such as "Opus". Anyone who picks none gets the rules above.';
const PINNED_NOTE = 'Stored search vectors depend on this feature’s models, so Synapse refuses names that would reach a different model.';

export function AliasesSection({ task, document, context, canEdit }: AliasesSectionProps): ReactElement {
  const editor = useSectionEditor(task.key, document, 'aliases');
  const labels = new Map(context.aliases.map(alias => [alias.key, alias.label]));
  return (
    <SectionCard title="Model names offered" subtitle={SUBTITLE} editor={editor} editLabel={canEdit ? 'Edit model names offered' : undefined}>
      {task.aliases.length === 0 ? (
        <p className={controls.hint}>No model names are offered, so people can&apos;t choose a model for this feature.</p>
      ) : (
        <div className={styles.tags}>
          {task.aliases.map(key => (
            <Tag key={key}>{aliasName({ key, label: labels.get(key) })}</Tag>
          ))}
        </div>
      )}
      <AliasesDrawer key={editor.session} task={task} context={context} editor={editor} />
    </SectionCard>
  );
}

function AliasesDrawer({ task, context, editor }: { task: TaskEntry; context: FeatureContext; editor: SectionEditor }): ReactElement {
  const [opened] = useState<readonly string[]>(task.aliases);
  const [selected, setSelected] = useState<string[]>(task.aliases);
  const hints = aliasHints(selected, context.aliases, context.models, task);
  const save = (): void => void editor.save(aliasesEdit(task.key, opened, selected));
  return (
    <EditorDrawer title="Model names offered" meta={SUBTITLE} editor={editor} canSave onSave={save}>
      <FormField label="Model names" helper="Retired names are never offered, even when listed here.">
        <MultiSelect options={aliasOptions(context.aliases, selected)} value={selected} onValueChange={setSelected} searchable maxVisibleTags={6} placeholder="No model names" />
      </FormField>
      {task.pinned ? <p className={controls.hint}>{PINNED_NOTE}</p> : null}
      {hints.length > 0 ? (
        <Alert intent="warning" title="Synapse will refuse these">
          <ul className={styles.issueList}>
            {hints.map(hint => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </EditorDrawer>
  );
}

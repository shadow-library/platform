import { type ReactElement, useState } from 'react';
import { Alert, FormField, Select } from '@shadow-library/ui';

import { type CatalogDocument, DATA_POLICIES, type DataPolicy, featureNote, type TaskEntry } from '@/features/catalog';
import { dataPolicyName } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { dataPolicyHints, type FeatureContext } from './feature-detail';
import styles from './Features.module.css';
import { dataPolicyEdit } from './section-edits';
import { EditorDrawer, SectionCard, type SectionEditor, useSectionEditor } from './SectionEditor';

interface DataPolicySectionProps {
  task: TaskEntry;
  document: CatalogDocument;
  context: FeatureContext;
  canEdit: boolean;
}

const SUBTITLE = 'Where the people’s requests for this feature may be sent.';

const EXPLANATIONS: Readonly<Record<DataPolicy, string>> = {
  any: 'Requests may go to any provider, including third-party APIs.',
  in_cluster_only: 'Only models running inside our own cluster may answer; requests never leave it.',
};

const isPolicy = (value: string): value is DataPolicy => (DATA_POLICIES as readonly string[]).includes(value);

export function DataPolicySection({ task, document, context, canEdit }: DataPolicySectionProps): ReactElement {
  const editor = useSectionEditor(task.key, document, 'dataPolicy');
  return (
    <SectionCard title="Data policy" subtitle={SUBTITLE} editor={editor} editLabel={canEdit ? 'Edit data policy' : undefined}>
      <p className={styles.policy}>{dataPolicyName(task.dataPolicy)}</p>
      <p className={controls.hint}>{EXPLANATIONS[task.dataPolicy]}</p>
      <DataPolicyDrawer key={editor.session} task={task} context={context} editor={editor} />
    </SectionCard>
  );
}

function DataPolicyDrawer({ task, context, editor }: { task: TaskEntry; context: FeatureContext; editor: SectionEditor }): ReactElement {
  const [opened] = useState<DataPolicy>(task.dataPolicy);
  const [policy, setPolicy] = useState<DataPolicy>(opened);
  const hints = dataPolicyHints(task, policy, context);
  const save = (): void => void editor.save(dataPolicyEdit(task.key, opened, policy), featureNote(task, 'data policy'));
  return (
    <EditorDrawer title="Data policy" meta={SUBTITLE} editor={editor} canSave onSave={save}>
      <FormField label="Data policy" helper={EXPLANATIONS[policy]}>
        <Select value={policy} onValueChange={next => (isPolicy(next) ? setPolicy(next) : undefined)} aria-label="Data policy">
          {DATA_POLICIES.map(option => (
            <Select.Item key={option} value={option}>
              {dataPolicyName(option)}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      {hints.length > 0 ? (
        <Alert intent="warning" title="Publishing will refuse this until these models change">
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

import { type ReactElement, useState } from 'react';
import { Alert, Button, Combobox, type ComboboxOption, FormField } from '@shadow-library/ui';

import { type CatalogDocument, type ModelEntry, resolveSelectorKey, selectorValues, type TaskEntry } from '@/features/catalog';
import { modelDisplayName, ModelPicker, modelPriceText, Mono, Muted, selectorName } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { type FeatureContext, featureNote } from './feature-detail';
import styles from './Features.module.css';
import {
  addCondition,
  addRule,
  conditionParts,
  displayRoutes,
  moveRule,
  removeCondition,
  removeRule,
  type RoutingDraft,
  routingFromRoutes,
  type RuleDraft,
  setCondition,
  setFallback,
  setRuleModel,
  validateRouting,
} from './route-rules';
import { routingEdit } from './section-edits';
import { EditorDrawer, SectionCard, type SectionEditor, useSectionEditor } from './SectionEditor';

interface RoutingSectionProps {
  task: TaskEntry;
  document: CatalogDocument;
  context: FeatureContext;
  canEdit: boolean;
}

const MATCHING_HINT = 'When several rules match a request, the one with the most conditions wins; a tie goes to the rule higher in the list.';
const PINNED_NOTE = 'Stored search vectors depend on this model, so it cannot change.';

export function RoutingSection({ task, document, context, canEdit }: RoutingSectionProps): ReactElement {
  const editor = useSectionEditor(task.key, document, 'routing');
  const models = new Map(context.models.map(model => [model.key, model]));
  return (
    <SectionCard
      title="Which model answers"
      subtitle="Rules are checked against what the app sends with each request, such as the person's tier."
      editor={editor}
      editLabel={canEdit && !task.pinned ? 'Edit which model answers' : undefined}
    >
      {task.pinned ? <p className={controls.hint}>{PINNED_NOTE}</p> : null}
      {task.routes.length === 0 ? (
        <p className={controls.hint}>This feature has no rules yet, so no model can answer it.</p>
      ) : (
        <ol className={styles.rules}>
          {displayRoutes(task.routes).map((route, index) => (
            <li key={index} className={styles.ruleLine}>
              <RuleConditions when={route.when} />
              <span aria-hidden> → </span>
              <span className="sr-only"> answered by </span>
              <RouteModel modelKey={route.model} model={models.get(route.model)} />
            </li>
          ))}
        </ol>
      )}
      {task.routes.length > 1 ? <p className={controls.hint}>{MATCHING_HINT}</p> : null}
      {task.pinned ? null : <RoutingDrawer key={editor.session} task={task} context={context} editor={editor} />}
    </SectionCard>
  );
}

function RouteModel({ modelKey, model }: { modelKey: string; model?: ModelEntry }): ReactElement {
  if (!model)
    return (
      <>
        <strong>{modelKey}</strong> <Muted>(not in the catalog)</Muted>
      </>
    );
  return (
    <>
      <strong>{modelDisplayName(model)}</strong> <Muted>({modelPriceText(model.pricePerMTok)})</Muted>
    </>
  );
}

function RuleConditions({ when }: { when?: Record<string, string> }): ReactElement {
  const parts = conditionParts(when);
  if (parts.length === 0) return <span>Everyone else</span>;
  return (
    <span>
      When{' '}
      {parts.map((part, index) => (
        <span key={part.selector}>
          {index > 0 ? ' and ' : null}
          <strong>{part.selector}</strong> is <strong>{part.value}</strong>
        </span>
      ))}
    </span>
  );
}

interface RoutingDrawerProps {
  task: TaskEntry;
  context: FeatureContext;
  editor: SectionEditor;
}

function RoutingDrawer({ task, context, editor }: RoutingDrawerProps): ReactElement {
  const [draft, setDraft] = useState<RoutingDraft>(() => routingFromRoutes(Array.isArray(editor.opened.routes) ? editor.opened.routes : []));
  const issues = validateRouting(draft);
  const knownKeys = Object.keys(context.vocabulary);
  const save = (): void => void editor.save(routingEdit(task.key, editor.opened.routes, draft), featureNote(task, 'routing updated'));
  const pickerNeeds = { requires: task.requires, kind: task.kind, dataPolicy: task.dataPolicy, providers: context.providers };

  return (
    <EditorDrawer title="Which model answers" meta={MATCHING_HINT} editor={editor} canSave={issues.length === 0} onSave={save} size="lg">
      {draft.rules.map((rule, index) => (
        <RuleEditor
          key={rule.id}
          rule={rule}
          index={index}
          count={draft.rules.length}
          knownKeys={knownKeys}
          context={context}
          issues={issues.filter(issue => issue.rule === index).map(issue => issue.message)}
          onChange={update => setDraft(current => update(current))}
          pickerNeeds={pickerNeeds}
        />
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => setDraft(addRule)}>
          Add rule
        </Button>
      </div>
      <section className={styles.ruleBlock} aria-label="Everyone else">
        <h3 className={styles.ruleTitle}>Everyone else</h3>
        <p className={controls.hint}>Requests no rule above matches. This rule is always last and can&apos;t be removed.</p>
        <FormField label="Answered by" error={issues.find(issue => issue.rule === null)?.message}>
          <ModelPicker {...pickerNeeds} models={context.models} value={draft.fallback} onValueChange={model => setDraft(current => setFallback(current, model))} />
        </FormField>
      </section>
    </EditorDrawer>
  );
}

interface RuleEditorProps {
  rule: RuleDraft;
  index: number;
  count: number;
  knownKeys: readonly string[];
  context: FeatureContext;
  issues: string[];
  onChange: (update: (draft: RoutingDraft) => RoutingDraft) => void;
  pickerNeeds: Pick<TaskEntry, 'requires' | 'kind' | 'dataPolicy'> & { providers: FeatureContext['providers'] };
}

function keyOptions(knownKeys: readonly string[], current: string): ComboboxOption[] {
  const keys = current && !knownKeys.includes(current) ? [current, ...knownKeys] : knownKeys;
  return keys.map(key => ({ value: key, label: selectorName(key), description: <Mono>{key}</Mono> }));
}

function valueOptions(known: readonly string[], current: string): ComboboxOption[] {
  const values = current && !known.includes(current) ? [current, ...known] : known;
  return values.map(value => ({ value, label: value }));
}

function RuleEditor({ rule, index, count, knownKeys, context, issues, onChange, pickerNeeds }: RuleEditorProps): ReactElement {
  const position = index + 1;
  return (
    <section className={styles.ruleBlock} aria-label={`Rule ${position}`}>
      <div className={styles.ruleHeader}>
        <h3 className={styles.ruleTitle}>Rule {position}</h3>
        <div className={controls.rowActions}>
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onChange(draft => moveRule(draft, index, -1))} aria-label={`Move rule ${position} up`}>
            Up
          </Button>
          <Button variant="ghost" size="sm" disabled={index === count - 1} onClick={() => onChange(draft => moveRule(draft, index, 1))} aria-label={`Move rule ${position} down`}>
            Down
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(draft => removeRule(draft, index))} aria-label={`Remove rule ${position}`}>
            Remove
          </Button>
        </div>
      </div>
      {rule.conditions.map((condition, conditionIndex) => {
        const key = condition.key.trim();
        const unknownKey = key.length > 0 && !knownKeys.includes(key);
        return (
          <div key={condition.id} className={styles.condition}>
            <span className={styles.conditionWord}>{conditionIndex === 0 ? 'When' : 'and'}</span>
            <Combobox
              className={styles.conditionField}
              options={keyOptions(knownKeys, key)}
              value={key || null}
              onValueChange={next => onChange(draft => setCondition(draft, index, conditionIndex, { key: next ?? '' }))}
              creatable
              onCreate={typed => onChange(draft => setCondition(draft, index, conditionIndex, { key: resolveSelectorKey(typed, knownKeys) }))}
              placeholder="Choose or type a condition"
              aria-label={`Rule ${position}, condition ${conditionIndex + 1} name`}
            />
            <span className={styles.conditionWord}>is</span>
            <Combobox
              className={styles.conditionField}
              options={valueOptions(selectorValues(context.vocabulary, key), condition.value.trim())}
              value={condition.value.trim() || null}
              onValueChange={next => onChange(draft => setCondition(draft, index, conditionIndex, { value: next ?? '' }))}
              creatable
              onCreate={typed => onChange(draft => setCondition(draft, index, conditionIndex, { value: typed.trim() }))}
              placeholder="Choose or type a value"
              aria-label={`Rule ${position}, condition ${conditionIndex + 1} value`}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(draft => removeCondition(draft, index, conditionIndex))}
              aria-label={`Remove condition ${conditionIndex + 1} of rule ${position}`}
            >
              Remove
            </Button>
            {unknownKey ? <p className={styles.conditionHint}>Nothing else in the catalog uses “{key}” yet; check the exact name with the app&apos;s developers.</p> : null}
          </div>
        );
      })}
      <div>
        <Button variant="text" size="sm" onClick={() => onChange(draft => addCondition(draft, index))}>
          Add condition
        </Button>
      </div>
      <FormField label="Answered by">
        <ModelPicker {...pickerNeeds} models={context.models} value={rule.model || null} onValueChange={model => onChange(draft => setRuleModel(draft, index, model))} />
      </FormField>
      {issues.length > 0 ? (
        <Alert intent="danger" className={styles.ruleIssues}>
          <ul className={styles.issueList}>
            {issues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </section>
  );
}

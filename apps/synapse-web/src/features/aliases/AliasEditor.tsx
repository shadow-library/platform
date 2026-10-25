import { type ReactElement, useState } from 'react';
import { Alert, Button, Combobox, type ComboboxOption, Drawer, FormField, Input, RadioGroup, Switch, Textarea, TokenInput } from '@shadow-library/ui';

import { ALIAS_STATES, type AliasState, type CatalogDocument, readModels, resolveSelectorKey, selectorVocabulary } from '@/features/catalog';
import { changeResultNotice, type ChangeWarning, isSettled, useChangeFlow } from '@/features/changes';
import { FormSection, type IssueNotice, IssueNoticeAlert, modelDisplayName, ModelPicker, Mono, selectorName } from '@/features/shared';
import formStyles from '@/features/shared/form.module.css';

import {
  addAliasEdit,
  addRule,
  type AliasEditorMode,
  type AliasForm,
  type AliasFormErrors,
  type AvailabilityRule,
  availableOfRules,
  removeRule,
  updateAliasEdit,
  updateRule,
  validateAliasForm,
  valueSuggestions,
} from './alias-form';
import { ALIAS_STATE_INFO, aliasModelNeeds, type AliasUser, narrowedConditions, narrowingDescription, retireDescription } from './alias-view';
import styles from './Aliases.module.css';

export interface AliasEditorProps {
  mode: AliasEditorMode;
  initial: AliasForm;
  document: CatalogDocument;
  takenKeys: readonly string[];
  usedBy: readonly AliasUser[];
  onClose: () => void;
  onSaved: (notice: IssueNotice | null) => void;
}

export function AliasEditor({ mode, initial, document, takenKeys, usedBy, onClose, onSaved }: AliasEditorProps): ReactElement {
  const flow = useChangeFlow();
  const [form, setForm] = useState<AliasForm>(initial);
  const [errors, setErrors] = useState<AliasFormErrors | null>(null);
  const [failure, setFailure] = useState<IssueNotice | null>(null);
  const models = readModels(document);
  const vocabulary = selectorVocabulary(document);
  const needs = mode.kind === 'edit' ? aliasModelNeeds(document, mode.key, form.state) : {};
  const context = { mode, takenKeys, initial };
  const target = models.find(model => model.key === form.model);

  const update = (patch: Partial<AliasForm>): void => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!errors) return;
    const result = validateAliasForm(next, context);
    setErrors(result.ok ? null : result.errors);
  };

  const warningOf = (name: string, fields: readonly string[], state: AliasState, available: Record<string, string[]> | undefined): ChangeWarning | undefined => {
    if (mode.kind !== 'edit') return undefined;
    if (fields.includes('state') && state === 'retired') return { title: `This retires ${name}`, body: retireDescription(name, usedBy) };
    const narrowed = fields.includes('available') && state !== 'retired' ? narrowedConditions(availableOfRules(initial.rules), available) : [];
    return narrowed.length > 0 ? { title: `This narrows where ${name} works`, body: narrowingDescription(name, narrowed) } : undefined;
  };

  const submit = async (): Promise<void> => {
    if (flow.pending) return;
    const result = validateAliasForm(form, context);
    setErrors(result.ok ? null : result.errors);
    if (!result.ok) return;
    const name = result.spec.label || result.key;
    const warning = warningOf(name, result.fields, result.spec.state, result.spec.available);
    setFailure(null);
    const edit = mode.kind === 'add' ? addAliasEdit(result.key, result.spec) : updateAliasEdit(result.key, initial, result.fields, result.spec);
    const outcome = await flow.confirmChange(edit, warning ? { warning } : {});
    const notice = changeResultNotice(outcome, name, mode.kind === 'add' ? 'added' : 'updated');
    if (isSettled(outcome)) onSaved(notice);
    else setFailure(notice);
  };

  const fieldError = errors?.fields ?? {};
  const title = mode.kind === 'add' ? 'Add model name' : `Edit ${initial.label || mode.key}`;

  return (
    <Drawer open onOpenChange={open => open || flow.pending || onClose()} size="lg">
      <Drawer.Header title={title} meta="Each change goes live for users as soon as you confirm it." />
      <Drawer.Body>
        <div className={formStyles.form}>
          {failure ? <IssueNoticeAlert notice={failure} /> : null}
          {errors ? <p className={styles.problem}>Some settings need attention before the model name can be saved.</p> : null}

          <FormSection title="About">
            {mode.kind === 'add' ? (
              <>
                <Alert intent="info" title="The key is permanent">
                  Apps store it when people pick this name, so it can never be renamed or deleted, only retired.
                </Alert>
                <FormField label="Key" required error={fieldError.key} helper="Letters, digits and . _ - : / @, starting with a letter or digit.">
                  <Input value={form.key} onValueChange={key => update({ key })} placeholder="opus" autoComplete="off" spellCheck={false} />
                </FormField>
              </>
            ) : (
              <FormField label="Key" helper="Apps store this key when people pick the name, so it can't be changed.">
                <Input value={mode.key} readOnly />
              </FormField>
            )}
            <FormField label="Name users see" required error={fieldError.label}>
              <Input value={form.label} onValueChange={label => update({ label })} placeholder="Opus" />
            </FormField>
            <FormField label="Description" optional helper="For people editing the catalog; apps don't show it.">
              <Textarea value={form.description} onValueChange={description => update({ description })} minRows={2} autoGrow />
            </FormField>
            <Switch
              label="Show the model's version"
              description={
                form.showVersion && target && !target.version
                  ? 'The target model has no version, so users see the name alone.'
                  : `Users see "${form.label.trim() || 'the name'}${target?.version ? ` ${target.version}` : ''}" instead of the name alone.`
              }
              checked={form.showVersion}
              onCheckedChange={showVersion => update({ showVersion })}
            />
          </FormSection>

          <FormSection title="Target model" hint="Requests made with this name go to this model. Change it to move everyone who picked the name.">
            <FormField label="Model" required error={fieldError.model}>
              <ModelPicker {...needs} models={models} value={form.model || null} onValueChange={model => update({ model })} invalid={fieldError.model !== undefined} />
            </FormField>
            {models.length === 0 ? <p className={formStyles.formSectionHint}>The catalog has no models yet. Add one on the Models screen first.</p> : null}
            {target && form.model !== initial.model ? <p className={formStyles.formSectionHint}>Points to {modelDisplayName(target)} once you apply the change.</p> : null}
          </FormSection>

          <FormSection title="State">
            <RadioGroup aria-label="State" value={form.state} onValueChange={value => update({ state: value as AliasState })}>
              {ALIAS_STATES.map(state => (
                <RadioGroup.Item key={state} value={state} label={ALIAS_STATE_INFO[state].label} description={ALIAS_STATE_INFO[state].meaning} />
              ))}
            </RadioGroup>
          </FormSection>

          <FormSection
            title="Available when"
            hint="Apps send conditions such as tier with each request. The name works only when every rule matches; with no rules it works everywhere. Outside these conditions, requests that name this model name are refused — they do not fall back to the feature's default model."
          >
            {form.rules.map((rule, index) => (
              <RuleEditor
                key={rule.rowId}
                rule={rule}
                position={index + 1}
                vocabulary={vocabulary}
                errors={errors?.rules[rule.rowId]}
                onChange={patch => update({ rules: updateRule(form.rules, rule.rowId, patch) })}
                onRemove={() => update({ rules: removeRule(form.rules, rule.rowId) })}
              />
            ))}
            <div>
              <Button variant="secondary" size="sm" onClick={() => update({ rules: addRule(form.rules) })}>
                Add rule
              </Button>
            </div>
          </FormSection>
        </div>
      </Drawer.Body>
      <Drawer.Footer cancel="Cancel" action={mode.kind === 'add' ? 'Add model name' : 'Save model name'} onAction={() => void submit()} loading={flow.pending} />
    </Drawer>
  );
}

interface RuleEditorProps {
  rule: AvailabilityRule;
  position: number;
  vocabulary: Readonly<Record<string, string[]>>;
  errors?: { selector?: string; values?: string };
  onChange: (patch: Partial<Omit<AvailabilityRule, 'rowId'>>) => void;
  onRemove: () => void;
}

function selectorOptions(knownKeys: readonly string[], current: string): ComboboxOption[] {
  const keys = current && !knownKeys.includes(current) ? [current, ...knownKeys] : knownKeys;
  return keys.map(key => ({ value: key, label: selectorName(key), description: <Mono>{key}</Mono> }));
}

function RuleEditor({ rule, position, vocabulary, errors, onChange, onRemove }: RuleEditorProps): ReactElement {
  const knownKeys = Object.keys(vocabulary);
  const selector = rule.selector.trim();
  const suggestions = valueSuggestions(vocabulary, selector, rule.values);
  const unknownSelector = selector !== '' && !knownKeys.includes(selector);
  return (
    <section className={styles.rule} aria-label={`Rule ${position}`}>
      <div className={styles.ruleHeader}>
        <h4 className={styles.ruleTitle}>Rule {position}</h4>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove rule ${position}`}>
          Remove
        </Button>
      </div>
      <div className={formStyles.formRow}>
        <FormField label="Condition" error={errors?.selector} className={formStyles.formGrow}>
          <Combobox
            options={selectorOptions(knownKeys, selector)}
            value={selector || null}
            onValueChange={next => onChange({ selector: next ?? '' })}
            creatable
            onCreate={typed => onChange({ selector: resolveSelectorKey(typed, knownKeys) })}
            placeholder="Choose or type a condition"
            invalid={errors?.selector !== undefined}
            aria-label={`Rule ${position} condition`}
          />
        </FormField>
        <FormField label="Is one of" error={errors?.values} helper="Press Enter or comma after each value." className={formStyles.formGrow}>
          <TokenInput
            value={rule.values.map(value => ({ value, valid: true }))}
            onValueChange={tokens => onChange({ values: tokens.map(token => token.value) })}
            validate={value => value.trim() !== ''}
            placeholder="Type a value"
            invalid={errors?.values !== undefined}
            aria-label={`Rule ${position} allowed values`}
          />
        </FormField>
      </div>
      {unknownSelector ? (
        <p className={formStyles.formSectionHint}>Nothing else in the catalog uses “{selector}” yet; check the exact name with the app&apos;s developers.</p>
      ) : null}
      {suggestions.length > 0 ? (
        <div className={styles.suggestions}>
          <span className={styles.suggestionsLabel}>Values in use:</span>
          {suggestions.map(value => (
            <Button key={value} variant="text" size="sm" onClick={() => onChange({ values: [...rule.values, value] })} aria-label={`Add ${value} to rule ${position}`}>
              + {value}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

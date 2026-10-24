import { type ReactElement, type ReactNode, useState } from 'react';
import { Button, Drawer, FormField, Input, MultiSelect, NumberStepper, Select, Switch } from '@shadow-library/ui';

import { EFFORTS, type ModelCapabilities, type ProviderEntry, type ReasoningMode, useDraftEdit } from '@/features/catalog';
import { effortName, providerName } from '@/features/shared';

import {
  addDeploymentRow,
  addModelEdit,
  type DeploymentRow,
  type EditorMode,
  type ModelForm,
  type ModelFormErrors,
  moveRow,
  reasoningPatch,
  sortEfforts,
  updateModelEdit,
  validateModelForm,
} from './model-form';
import { defaultModelNote, draftOutcomeNotice, type ModelNotice, modelTitle } from './model-view';
import { NoticeAlert } from './NoticeAlert';
import styles from './Models.module.css';

const PRICE_STEP = 0.1;
const CONTEXT_STEP = 1000;

const REASONING_OPTIONS: readonly { value: ReasoningMode; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: "The model doesn't reason before answering" },
  { value: 'optional', label: 'Optional', description: 'Reasoning can be turned on or off per call' },
  { value: 'mandatory', label: 'Always on', description: 'The model always reasons' },
];

const STRUCTURED_OUTPUT_OPTIONS: readonly { value: ModelCapabilities['structuredOutput']; label: string; description: string }[] = [
  { value: 'native', label: 'Native', description: 'The provider enforces the answer format' },
  { value: 'prompt', label: 'Through the prompt', description: 'Synapse describes the format in the prompt' },
];

const EFFORT_OPTIONS = EFFORTS.map(effort => ({ value: effort, label: effortName(effort) }));

export interface ModelEditorProps {
  mode: EditorMode;
  initial: ModelForm;
  providers: readonly ProviderEntry[];
  takenKeys: readonly string[];
  onClose: () => void;
  onSaved: (notice: ModelNotice) => void;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <section className={styles.formSection}>
      <div>
        <h3 className={styles.formSectionTitle}>{title}</h3>
        {hint ? <p className={styles.formSectionHint}>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ModelEditor({ mode, initial, providers, takenKeys, onClose, onSaved }: ModelEditorProps): ReactElement {
  const draftEdit = useDraftEdit();
  const [form, setForm] = useState<ModelForm>(initial);
  const [errors, setErrors] = useState<ModelFormErrors | null>(null);
  const [failure, setFailure] = useState<ModelNotice | null>(null);
  const providerKeys = providers.map(provider => provider.key);
  const context = { mode, takenKeys, providerKeys };

  const update = (patch: Partial<ModelForm>): void => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!errors) return;
    const result = validateModelForm(next, context);
    setErrors(result.ok ? null : result.errors);
  };

  const updateRow = (rowId: number, patch: Partial<DeploymentRow>): void =>
    update({ deployments: form.deployments.map(row => (row.rowId === rowId ? { ...row, ...patch } : row)) });

  const submit = async (): Promise<void> => {
    if (draftEdit.pending) return;
    const result = validateModelForm(form, context);
    setErrors(result.ok ? null : result.errors);
    if (!result.ok) return;
    setFailure(null);
    const action = mode.kind === 'add' ? 'added' : 'updated';
    const name = modelTitle({ key: result.key, label: result.spec.label, version: result.spec.version });
    const edit = mode.kind === 'add' ? addModelEdit(result.key, result.spec) : updateModelEdit(result.key, initial, form, result.spec);
    const outcome = await draftEdit.apply(edit, defaultModelNote(name, action));
    const notice = draftOutcomeNotice(outcome, name, action);
    if (outcome.kind === 'saved' || outcome.kind === 'unchanged') onSaved(notice);
    else setFailure(notice);
  };

  const fieldError = errors?.fields ?? {};
  const unknownProviders = [...new Set(form.deployments.map(row => row.provider))].filter(key => key !== '' && !providerKeys.includes(key));
  const title = mode.kind === 'add' ? 'Add model' : `Edit ${modelTitle({ key: mode.key, label: initial.label, version: initial.version })}`;

  return (
    <Drawer open onOpenChange={open => open || draftEdit.pending || onClose()} size="lg">
      <Drawer.Header title={title} meta="Saved to the draft; nothing changes for users until the draft is published." />
      <Drawer.Body>
        <div className={styles.form}>
          {failure ? <NoticeAlert notice={failure} /> : null}
          {errors ? <p className={styles.problem}>Some settings need attention before the model can be saved.</p> : null}

          <Section title="About">
            {mode.kind === 'add' ? (
              <FormField label="Key" required error={fieldError.key} helper="How features and model names refer to this model. It can't be changed later.">
                <Input value={form.key} onValueChange={key => update({ key })} placeholder="sonnet-5.5" autoComplete="off" spellCheck={false} />
              </FormField>
            ) : (
              <FormField label="Key" helper="Features and model names refer to the model by this key, so it can't be changed.">
                <Input value={mode.key} readOnly />
              </FormField>
            )}
            <div className={styles.formRow}>
              <FormField label="Name" required error={fieldError.label} className={styles.formGrow}>
                <Input value={form.label} onValueChange={label => update({ label })} placeholder="Sonnet 5.5" />
              </FormField>
              <FormField label="Version" optional helper="Shown only where a model name opts in." className={styles.formGrow}>
                <Input value={form.version} onValueChange={version => update({ version })} placeholder="5.5" />
              </FormField>
            </div>
          </Section>

          <Section title="Prices" hint="List prices in US dollars per million tokens. Budgets count these, even for calls a subscription covers.">
            <div className={styles.formRow}>
              <PriceField label="Input" required value={form.input} error={fieldError.input} onChange={input => update({ input })} />
              <PriceField
                label="Cached input"
                value={form.cachedInput}
                error={fieldError.cachedInput}
                helper="Leave empty if cached input isn't cheaper"
                onChange={cachedInput => update({ cachedInput })}
              />
              <PriceField label="Output" required value={form.output} error={fieldError.output} onChange={output => update({ output })} />
              <PriceField
                label="Per image"
                value={form.perImage}
                error={fieldError.perImage}
                helper="For models that generate images"
                onChange={perImage => update({ perImage })}
              />
            </div>
          </Section>

          <Section title="What it can do">
            <Switch label="Tools" description="Can call functions the feature offers." checked={form.tools} onCheckedChange={tools => update({ tools })} />
            <Switch label="Vision" description="Can read images in the prompt." checked={form.vision} onCheckedChange={vision => update({ vision })} />
            <Switch
              label="Image output"
              description="Can generate images, so it can serve image features."
              checked={form.imageOutput}
              onCheckedChange={imageOutput => update({ imageOutput })}
            />
            <Switch
              label="Prompt caching"
              description="Keeps Anthropic-style cache markers, so repeated context is billed at the cached price."
              checked={form.promptCache === 'anthropic'}
              onCheckedChange={cached => update({ promptCache: cached ? 'anthropic' : 'none' })}
            />
            <Switch
              label="Sampling controls"
              description="Accepts temperature and similar settings; Synapse drops them for models that don't."
              checked={form.sampling}
              onCheckedChange={sampling => update({ sampling })}
            />
            <div className={styles.formRow}>
              <FormField label="Structured output" className={styles.formGrow}>
                <Select
                  value={form.structuredOutput}
                  onValueChange={value => update({ structuredOutput: value as ModelCapabilities['structuredOutput'] })}
                  aria-label="Structured output"
                >
                  {STRUCTURED_OUTPUT_OPTIONS.map(option => (
                    <Select.Item key={option.value} value={option.value} description={option.description}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              <FormField label="Context window" optional error={fieldError.context} helper="In tokens" className={styles.formGrow}>
                <NumberStepper
                  value={form.context}
                  onValueChange={value => update({ context: value })}
                  min={1}
                  step={CONTEXT_STEP}
                  clampOnBlur={false}
                  buttons="chevrons"
                  invalid={fieldError.context !== undefined}
                  aria-label="Context window in tokens"
                />
              </FormField>
            </div>
            <div className={styles.formRow}>
              <FormField label="Reasoning" className={styles.formGrow}>
                <Select value={form.reasoning} onValueChange={value => update(reasoningPatch(value as ReasoningMode, form.efforts))} aria-label="Reasoning">
                  {REASONING_OPTIONS.map(option => (
                    <Select.Item key={option.value} value={option.value} description={option.description}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Supported efforts"
                optional
                helper={form.reasoning === 'none' ? 'Used only by a model that reasons' : 'A requested effort the model lacks is adjusted to one it supports'}
                className={styles.formGrow}
              >
                <MultiSelect
                  options={EFFORT_OPTIONS}
                  value={form.efforts}
                  onValueChange={value => update({ efforts: sortEfforts(value) })}
                  disabled={form.reasoning === 'none' && form.efforts.length === 0}
                  placeholder="Not set"
                  aria-label="Supported efforts"
                />
              </FormField>
            </div>
            <FormField
              label="Embedding dimensions"
              optional
              error={fieldError.dimensions}
              helper="Only for embedding models. Setting it means the model serves embedding features and nothing else."
            >
              <NumberStepper
                value={form.dimensions}
                onValueChange={value => update({ dimensions: value })}
                min={1}
                clampOnBlur={false}
                buttons="chevrons"
                invalid={fieldError.dimensions !== undefined}
                aria-label="Embedding dimensions"
              />
            </FormField>
          </Section>

          <Section title="Served by" hint="Tried in order; the next is used if one fails.">
            {fieldError.deployments ? <p className={styles.problem}>{fieldError.deployments}</p> : null}
            <ol className={styles.deployments}>
              {form.deployments.map((row, index) => {
                const rowErrors = errors?.deployments[row.rowId] ?? {};
                const position = index + 1;
                return (
                  <li key={row.rowId} className={styles.deployment}>
                    <span className={styles.deploymentPosition}>{position}.</span>
                    <FormField error={rowErrors.provider} className={styles.deploymentProvider}>
                      <Select
                        value={row.provider}
                        onValueChange={provider => updateRow(row.rowId, { provider })}
                        placeholder="Choose a provider"
                        invalid={rowErrors.provider !== undefined}
                        aria-label={`Provider ${position}`}
                      >
                        {providers.map(provider => (
                          <Select.Item key={provider.key} value={provider.key} description={provider.key}>
                            {providerName(provider.key)}
                          </Select.Item>
                        ))}
                        {unknownProviders.map(key => (
                          <Select.Item key={key} value={key} description="Not in the catalog">
                            {providerName(key)}
                          </Select.Item>
                        ))}
                      </Select>
                    </FormField>
                    <FormField error={rowErrors.id} className={styles.deploymentId}>
                      <Input
                        value={row.id}
                        onValueChange={id => updateRow(row.rowId, { id })}
                        placeholder="The provider's own model id"
                        invalid={rowErrors.id !== undefined}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={`Model id at provider ${position}`}
                      />
                    </FormField>
                    <div className={styles.deploymentActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        aria-label={`Move provider ${position} up`}
                        onClick={() => update({ deployments: moveRow(form.deployments, index, -1) })}
                      >
                        Up
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === form.deployments.length - 1}
                        aria-label={`Move provider ${position} down`}
                        onClick={() => update({ deployments: moveRow(form.deployments, index, 1) })}
                      >
                        Down
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove provider ${position}`}
                        onClick={() => update({ deployments: form.deployments.filter(item => item.rowId !== row.rowId) })}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div>
              <Button variant="secondary" size="sm" onClick={() => update({ deployments: addDeploymentRow(form.deployments) })}>
                Add provider
              </Button>
            </div>
            {providers.length === 0 ? <p className={styles.formSectionHint}>The catalog has no providers yet. Add one on the Providers screen first.</p> : null}
          </Section>
        </div>
      </Drawer.Body>
      <Drawer.Footer cancel="Cancel" action={mode.kind === 'add' ? 'Add model' : 'Save model'} onAction={() => void submit()} loading={draftEdit.pending} />
    </Drawer>
  );
}

interface PriceFieldProps {
  label: string;
  value: number | null;
  required?: boolean;
  error?: string;
  helper?: string;
  onChange: (value: number | null) => void;
}

function PriceField({ label, value, required, error, helper, onChange }: PriceFieldProps): ReactElement {
  return (
    <FormField label={label} required={required} optional={!required} error={error} helper={helper} className={styles.formGrow}>
      <NumberStepper
        value={value}
        onValueChange={onChange}
        min={0}
        step={PRICE_STEP}
        clampOnBlur={false}
        buttons="chevrons"
        invalid={error !== undefined}
        aria-label={`${label} price in US dollars`}
      />
    </FormField>
  );
}

import { type ReactElement, useState } from 'react';
import { Alert, Button, Drawer, FormField, Input, MultiSelect, NumberStepper, Select } from '@shadow-library/ui';

import {
  PROVIDER_COSTS,
  PROVIDER_FEATURES,
  PROVIDER_FLAVORS,
  PROVIDER_KINDS,
  PROVIDER_LOCALITIES,
  type ProviderCost,
  type ProviderFlavor,
  type ProviderKind,
  type ProviderLocality,
} from '@/features/catalog';
import { changeResultNotice, isSettled, useChangeFlow } from '@/features/changes';
import { FormSection, type IssueNotice, IssueNoticeAlert, Mono, providerName } from '@/features/shared';
import formStyles from '@/features/shared/form.module.css';

import { type CredentialList, CredentialPicker, LegacyKeyBadge, listedCredentials, unlistedReason } from './CredentialPicker';
import {
  addProviderEdit,
  keyBindingWarning,
  kindPatch,
  type ProviderEditorMode,
  type ProviderForm,
  type ProviderFormErrors,
  updateProviderEdit,
  validateProviderForm,
} from './provider-form';
import {
  COST_DESCRIPTIONS,
  costName,
  featureName,
  FLAVOR_DESCRIPTIONS,
  flavorName,
  KIND_DESCRIPTIONS,
  kindLabel,
  LOCALITY_DESCRIPTIONS,
  localityName,
  sortFeatures,
} from './provider-view';
import styles from './Providers.module.css';

const FEATURE_OPTIONS = PROVIDER_FEATURES.map(feature => ({ value: feature, label: featureName(feature) }));

export interface ProviderEditorProps {
  mode: ProviderEditorMode;
  initial: ProviderForm;
  takenKeys: readonly string[];
  credentials: CredentialList;
  onClose: () => void;
  onSaved: (notice: IssueNotice | null) => void;
}

interface KeyFieldProps {
  form: ProviderForm;
  credentials: CredentialList;
  onChange: (credential: string) => void;
}

function KeyField({ form, credentials, onChange }: KeyFieldProps): ReactElement {
  if (form.kind === 'ollama' && form.credential === '') return <p className={formStyles.formSectionHint}>An Ollama provider never sends an API key, so none is needed.</p>;
  if (form.kind === 'ollama')
    return (
      <div className={styles.inline}>
        <p className={styles.problem}>An Ollama provider never sends an API key, yet this one still names a stored key, so Synapse will refuse the change.</p>
        <Button variant="secondary" size="sm" onClick={() => onChange('')}>
          Remove key
        </Button>
      </div>
    );
  if (credentials.status !== 'ready')
    return (
      <div className={styles.stack}>
        {form.apiKeyConfig ? <LegacyKeyBadge apiKeyConfig={form.apiKeyConfig} alongside={form.credential !== ''} /> : null}
        {form.credential ? <Mono>{form.credential}</Mono> : null}
        <p className={formStyles.formSectionHint}>
          {form.credential ? 'A stored key is chosen. ' : 'No stored key is chosen. '}
          {unlistedReason(credentials)}
        </p>
      </div>
    );
  return (
    <FormField label="Stored API key" optional helper="Only keys bound to this provider's address are offered. Add one on the Credentials screen.">
      <CredentialPicker
        ownerName={form.key || 'the new provider'}
        url={form.url}
        value={form.credential}
        apiKeyConfig={form.apiKeyConfig}
        credentials={credentials.items}
        onChange={id => onChange(id ?? '')}
      />
    </FormField>
  );
}

export function ProviderEditor({ mode, initial, takenKeys, credentials, onClose, onSaved }: ProviderEditorProps): ReactElement {
  const flow = useChangeFlow();
  const [form, setForm] = useState<ProviderForm>(initial);
  const [errors, setErrors] = useState<ProviderFormErrors | null>(null);
  const [failure, setFailure] = useState<IssueNotice | null>(null);
  const context = { mode, takenKeys };

  const update = (patch: Partial<ProviderForm>): void => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!errors) return;
    const result = validateProviderForm(next, context);
    setErrors(result.ok ? null : result.errors);
  };

  const submit = async (): Promise<void> => {
    if (flow.pending) return;
    const result = validateProviderForm(form, context);
    setErrors(result.ok ? null : result.errors);
    if (!result.ok) return;
    setFailure(null);
    const action = mode.kind === 'add' ? 'added' : 'updated';
    const name = providerName(result.key);
    const edit = mode.kind === 'add' ? addProviderEdit(result.key, result.spec) : updateProviderEdit(result.key, initial, form, result.spec);
    const outcome = await flow.confirmChange(edit);
    const notice = changeResultNotice(outcome, name, action);
    if (isSettled(outcome)) onSaved(notice);
    else setFailure(notice);
  };

  const fieldError = errors ?? {};
  const warning = keyBindingWarning(form, initial.url, listedCredentials(credentials));
  const title = mode.kind === 'add' ? 'Add provider' : `Edit ${providerName(mode.key)}`;

  return (
    <Drawer open onOpenChange={open => open || flow.pending || onClose()} size="lg">
      <Drawer.Header title={title} meta="Each change goes live for apps as soon as you confirm it." />
      <Drawer.Body>
        <div className={formStyles.form}>
          {failure ? <IssueNoticeAlert notice={failure} /> : null}
          {errors ? <p className={styles.problem}>Some settings need attention before the provider can be saved.</p> : null}

          <FormSection title="About">
            {mode.kind === 'add' ? (
              <FormField label="Key" required error={fieldError.key} helper="How models refer to this provider. It can't be changed later.">
                <Input value={form.key} onValueChange={key => update({ key })} placeholder="openrouter" autoComplete="off" spellCheck={false} />
              </FormField>
            ) : (
              <FormField label="Key" helper="Models refer to the provider by this key, so it can't be changed.">
                <Input value={mode.key} readOnly />
              </FormField>
            )}
            <div className={formStyles.formRow}>
              <FormField label="Kind" required error={fieldError.kind} className={formStyles.formGrow}>
                <Select
                  value={form.kind}
                  onValueChange={kind => update(kindPatch(form, kind as ProviderKind, initial))}
                  placeholder="Choose a kind"
                  invalid={fieldError.kind !== undefined}
                  aria-label="Kind"
                >
                  {PROVIDER_KINDS.map(kind => (
                    <Select.Item key={kind} value={kind} description={KIND_DESCRIPTIONS[kind]}>
                      {kindLabel(kind)}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              {form.kind === 'openai' ? (
                <FormField label="Service" required error={fieldError.flavor} className={formStyles.formGrow}>
                  <Select
                    value={form.flavor}
                    onValueChange={flavor => update({ flavor: flavor as ProviderFlavor })}
                    placeholder="Choose a service"
                    invalid={fieldError.flavor !== undefined}
                    aria-label="Service"
                  >
                    {PROVIDER_FLAVORS.map(flavor => (
                      <Select.Item key={flavor} value={flavor} description={FLAVOR_DESCRIPTIONS[flavor]}>
                        {flavorName(flavor)}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
              ) : null}
            </div>
            <FormField label="Address" required error={fieldError.url} helper="The base URL Synapse sends calls to.">
              <Input value={form.url} onValueChange={url => update({ url })} placeholder="https://openrouter.ai/api/v1" autoComplete="off" spellCheck={false} />
            </FormField>
          </FormSection>

          <FormSection title="Where it runs and what it costs" hint="Features restricted to our cluster can only use providers that run inside it.">
            <div className={formStyles.formRow}>
              <FormField label="Where it runs" required error={fieldError.locality} className={formStyles.formGrow}>
                <Select
                  value={form.locality}
                  onValueChange={locality => update({ locality: locality as ProviderLocality })}
                  placeholder="Choose where it runs"
                  invalid={fieldError.locality !== undefined}
                  aria-label="Where it runs"
                >
                  {PROVIDER_LOCALITIES.map(locality => (
                    <Select.Item key={locality} value={locality} description={LOCALITY_DESCRIPTIONS[locality]}>
                      {localityName(locality)}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              <FormField label="Cost" required error={fieldError.cost} className={formStyles.formGrow}>
                <Select
                  value={form.cost}
                  onValueChange={cost => update({ cost: cost as ProviderCost })}
                  placeholder="Choose how it is paid for"
                  invalid={fieldError.cost !== undefined}
                  aria-label="Cost"
                >
                  {PROVIDER_COSTS.map(cost => (
                    <Select.Item key={cost} value={cost} description={COST_DESCRIPTIONS[cost]}>
                      {costName(cost)}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className={formStyles.formRow}>
              <FormField label="Features" optional helper="What the provider offers beyond plain calls." className={formStyles.formGrow}>
                <MultiSelect
                  options={FEATURE_OPTIONS}
                  value={form.features}
                  onValueChange={features => update({ features: sortFeatures(features) })}
                  placeholder="None"
                  aria-label="Features"
                />
              </FormField>
              <FormField
                label="Calls at once"
                optional
                error={fieldError.maxInflightPerReplica}
                helper="Most calls each Synapse server sends it at the same time. Leave empty for no limit."
                className={formStyles.formGrow}
              >
                <NumberStepper
                  value={form.maxInflightPerReplica}
                  onValueChange={value => update({ maxInflightPerReplica: value })}
                  min={1}
                  clampOnBlur={false}
                  buttons="chevrons"
                  invalid={fieldError.maxInflightPerReplica !== undefined}
                  aria-label="Most calls at once"
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="API key" hint="Keys are stored sealed in Synapse and are only ever sent to the site they are bound to.">
            <KeyField form={form} credentials={credentials} onChange={credential => update({ credential })} />
            {warning ? (
              <Alert intent="warning" title="The API key won't work at this address">
                {warning}
              </Alert>
            ) : null}
            {form.apiKeyConfig && form.kind !== 'ollama' && credentials.status === 'ready' && form.credential === '' ? (
              <p className={formStyles.formSectionHint}>The old environment key setting is being retired. Choosing a stored key replaces it.</p>
            ) : null}
          </FormSection>
        </div>
      </Drawer.Body>
      <Drawer.Footer cancel="Cancel" action={mode.kind === 'add' ? 'Add provider' : 'Save provider'} onAction={() => void submit()} loading={flow.pending} />
    </Drawer>
  );
}

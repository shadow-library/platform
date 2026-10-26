import { type ReactElement, useState } from 'react';
import { Alert, Button, Drawer, FormField, Input, NumberStepper, Select } from '@shadow-library/ui';

import { WEB_SEARCH_KINDS, type WebSearchKind } from '@/features/catalog';
import { changeResultNotice, isSettled, useChangeFlow } from '@/features/changes';
import { FormSection, type IssueNotice, IssueNoticeAlert, Mono } from '@/features/shared';
import formStyles from '@/features/shared/form.module.css';

import { type CredentialList, CredentialPicker, listedCredentials, unlistedReason } from './CredentialPicker';
import { storedKeyWarning } from './provider-form';
import styles from './Providers.module.css';
import {
  addWebSearchEdit,
  BRAVE_URL,
  MAX_SEARCH_RESULTS,
  MAX_SEARCHES,
  updateWebSearchEdit,
  validateWebSearchForm,
  type WebSearchEditorMode,
  type WebSearchForm,
  type WebSearchFormErrors,
  webSearchKindPatch,
} from './web-search-form';
import { WEB_SEARCH_KIND_DESCRIPTIONS, webSearchKindName } from './web-search-view';

const PRICE_STEP = 0.001;

const OWNER = 'web search';

export interface WebSearchEditorProps {
  mode: WebSearchEditorMode;
  initial: WebSearchForm;
  credentials: CredentialList;
  onClose: () => void;
  onSaved: (notice: IssueNotice | null) => void;
}

interface KeyFieldProps {
  form: WebSearchForm;
  error?: string;
  credentials: CredentialList;
  onChange: (credential: string) => void;
}

function KeyField({ form, error, credentials, onChange }: KeyFieldProps): ReactElement {
  if (form.kind === 'mock' && form.credential === '') return <p className={formStyles.formSectionHint}>A test stand-in never leaves Synapse, so it sends no API key.</p>;
  if (form.kind === 'mock')
    return (
      <div className={styles.inline}>
        <p className={styles.problem}>A test stand-in never sends an API key, yet this one still names a stored key, so Synapse will refuse the change.</p>
        <Button variant="secondary" size="sm" onClick={() => onChange('')}>
          Remove key
        </Button>
      </div>
    );
  if (credentials.status !== 'ready')
    return (
      <div className={styles.stack}>
        {form.credential ? <Mono>{form.credential}</Mono> : null}
        <p className={formStyles.formSectionHint}>
          {form.credential ? 'A stored key is chosen. ' : 'No stored key is chosen. '}
          {unlistedReason(credentials)}
        </p>
        {error ? <p className={styles.problem}>{error}</p> : null}
      </div>
    );
  return (
    <FormField label="Stored API key" required error={error} helper="Only keys bound to this address are offered. Add one on the Credentials screen.">
      <CredentialPicker ownerName={OWNER} url={form.url} value={form.credential} credentials={credentials.items} onChange={id => onChange(id ?? '')} />
    </FormField>
  );
}

export function WebSearchEditor({ mode, initial, credentials, onClose, onSaved }: WebSearchEditorProps): ReactElement {
  const flow = useChangeFlow();
  const [form, setForm] = useState<WebSearchForm>(initial);
  const [errors, setErrors] = useState<WebSearchFormErrors | null>(null);
  const [failure, setFailure] = useState<IssueNotice | null>(null);

  const update = (patch: Partial<WebSearchForm>): void => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!errors) return;
    const result = validateWebSearchForm(next);
    setErrors(result.ok ? null : result.errors);
  };

  const submit = async (): Promise<void> => {
    if (flow.pending) return;
    const result = validateWebSearchForm(form);
    setErrors(result.ok ? null : result.errors);
    if (!result.ok) return;
    setFailure(null);
    const edit = mode === 'add' ? addWebSearchEdit(result.spec) : updateWebSearchEdit(initial, form, result.spec);
    const outcome = await flow.confirmChange(edit);
    const notice = changeResultNotice(outcome, 'Web search', mode === 'add' ? 'added' : 'updated');
    if (isSettled(outcome)) onSaved(notice);
    else setFailure(notice);
  };

  const fieldError = errors ?? {};
  const warning = form.kind === 'brave' ? storedKeyWarning(form.url, form.credential, initial.url, listedCredentials(credentials)) : undefined;

  return (
    <Drawer open onOpenChange={open => open || flow.pending || onClose()} size="lg">
      <Drawer.Header title={mode === 'add' ? 'Set up web search' : 'Edit web search'} meta="Each change goes live for apps as soon as you confirm it." />
      <Drawer.Body>
        <div className={formStyles.form}>
          {failure ? <IssueNoticeAlert notice={failure} /> : null}
          {errors ? <p className={styles.problem}>Some settings need attention before web search can be saved.</p> : null}

          <FormSection title="Search engine" hint="Used for a chat that asks for web search and is served by a model without its own.">
            <FormField label="Engine" required error={fieldError.kind}>
              <Select
                value={form.kind}
                onValueChange={kind => update(webSearchKindPatch(form, kind as WebSearchKind, initial))}
                placeholder="Choose a search engine"
                invalid={fieldError.kind !== undefined}
                aria-label="Search engine"
              >
                {WEB_SEARCH_KINDS.map(kind => (
                  <Select.Item key={kind} value={kind} description={WEB_SEARCH_KIND_DESCRIPTIONS[kind]}>
                    {webSearchKindName(kind)}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Address"
              required
              error={fieldError.url}
              helper={form.kind === 'mock' ? 'Never called: a test stand-in answers inside Synapse.' : "The API's base address, with no path; Synapse adds the search path itself."}
            >
              <Input value={form.url} onValueChange={url => update({ url })} placeholder={BRAVE_URL} autoComplete="off" spellCheck={false} />
            </FormField>
          </FormSection>

          <FormSection title="API key" hint="Keys are stored sealed in Synapse and are only ever sent to the site they are bound to.">
            <KeyField form={form} error={fieldError.credential} credentials={credentials} onChange={credential => update({ credential })} />
            {warning ? (
              <Alert intent="warning" title="The API key won't work at this address">
                {warning}
              </Alert>
            ) : null}
          </FormSection>

          <FormSection title="Limits and price" hint="Each search is another round in which the model reads the whole conversation again, so more searches cost more.">
            <div className={formStyles.formRow}>
              <FormField
                label="Searches per answer"
                required
                error={fieldError.maxSearches}
                helper={`The most one answer may run, up to ${MAX_SEARCHES}. The last round must answer.`}
                className={formStyles.formGrow}
              >
                <NumberStepper
                  value={form.maxSearches}
                  onValueChange={maxSearches => update({ maxSearches })}
                  min={1}
                  max={MAX_SEARCHES}
                  clampOnBlur={false}
                  buttons="chevrons"
                  invalid={fieldError.maxSearches !== undefined}
                  aria-label="Searches per answer"
                />
              </FormField>
              <FormField
                label="Results per search"
                required
                error={fieldError.results}
                helper={`How many results each search hands the model, up to ${MAX_SEARCH_RESULTS}.`}
                className={formStyles.formGrow}
              >
                <NumberStepper
                  value={form.results}
                  onValueChange={results => update({ results })}
                  min={1}
                  max={MAX_SEARCH_RESULTS}
                  clampOnBlur={false}
                  buttons="chevrons"
                  invalid={fieldError.results !== undefined}
                  aria-label="Results per search"
                />
              </FormField>
            </div>
            <FormField
              label="Price per search"
              optional
              error={fieldError.pricePerSearchUsd}
              helper="In US dollars. Added to a call's list price for each search it runs, so budgets count it. Leave empty to count searches as free."
            >
              <NumberStepper
                value={form.pricePerSearchUsd}
                onValueChange={pricePerSearchUsd => update({ pricePerSearchUsd })}
                min={0}
                step={PRICE_STEP}
                clampOnBlur={false}
                buttons="chevrons"
                invalid={fieldError.pricePerSearchUsd !== undefined}
                aria-label="Price per search in US dollars"
              />
            </FormField>
          </FormSection>
        </div>
      </Drawer.Body>
      <Drawer.Footer cancel="Cancel" action={mode === 'add' ? 'Set up web search' : 'Save web search'} onAction={() => void submit()} loading={flow.pending} />
    </Drawer>
  );
}

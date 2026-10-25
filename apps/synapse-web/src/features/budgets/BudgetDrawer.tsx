import { type ReactElement, useState } from 'react';
import { Alert, Button, Drawer, FormField, Input, RadioGroup, Select } from '@shadow-library/ui';

import { type BudgetEntry, type BudgetScope, type BudgetWindow, readTasks } from '@/features/catalog';
import { appName } from '@/features/shared';
import { type CatalogIssueResponse } from '@/lib';

import {
  budgetApps,
  type BudgetBasis,
  type BudgetChange,
  type BudgetFormErrors,
  budgetFormOf,
  type BudgetFormValues,
  NOTE_MAX_LENGTH,
  planBudgetPublish,
  sharesCounter,
  validateBudgetForm,
} from './budget-form';
import { BudgetIssues } from './BudgetIssues';
import styles from './Budgets.module.css';
import { budgetTitle } from './budget-view';

export type BudgetDrawerTarget = { kind: 'add' } | { kind: 'edit'; entry: BudgetEntry };

export type BudgetSubmitOutcome = { kind: 'done' } | { kind: 'kept' } | { kind: 'invalid'; issues: CatalogIssueResponse[] } | { kind: 'failed'; message: string };

export type PublishStage = 'confirming' | 'publishing';

type DrawerStage = 'editing' | 'checking' | PublishStage;

export interface BudgetDrawerProps {
  target: BudgetDrawerTarget;
  /** The active catalog as it was when the drawer opened; a newer one arriving meanwhile must not move the edit onto it */
  basis: BudgetBasis;
  onSubmit: (basis: BudgetBasis, change: BudgetChange, note: string, onStage: (stage: PublishStage) => void) => Promise<BudgetSubmitOutcome>;
  onClose: () => void;
}

type Failure = { kind: 'invalid'; issues: CatalogIssueResponse[] } | { kind: 'failed'; message: string } | null;

const SCOPES: readonly { value: BudgetScope; label: string; description: string }[] = [
  { value: 'subject', label: 'Each user', description: 'Every user of the app gets this limit on their own.' },
  { value: 'app', label: 'Whole app', description: 'All of the app’s users share one limit.' },
];

const WINDOWS: readonly { value: BudgetWindow; label: string }[] = [
  { value: '1h', label: 'Per hour' },
  { value: '1d', label: 'Per day' },
  { value: '30d', label: 'Per 30 days' },
];

const WINDOW_HELPER = 'Fixed UTC periods: an hour starts on the hour, a day at midnight UTC, and 30-day periods are counted from 1 January 1970, not by calendar month.';

function changeOf(target: BudgetDrawerTarget, values: BudgetFormValues): BudgetChange | null {
  const result = validateBudgetForm(values, target.kind === 'edit' ? target.entry : undefined);
  if (!result.ok) return null;
  return target.kind === 'add' ? { kind: 'add', budget: result.budget } : { kind: 'edit', index: target.entry.index, budget: result.budget };
}

/** The parent mounts the drawer only while it is open. */
export function BudgetDrawer({ target, basis, onSubmit, onClose }: BudgetDrawerProps): ReactElement {
  const editing: BudgetEntry | undefined = target.kind === 'edit' ? target.entry : undefined;
  const [apps] = useState(() => budgetApps(readTasks(basis.document), editing?.app));
  const [values, setValues] = useState<BudgetFormValues>(() => budgetFormOf(editing, apps));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<BudgetFormErrors>({});
  const [failure, setFailure] = useState<Failure>(null);
  const [stage, setStage] = useState<DrawerStage>('editing');
  const busy = stage !== 'editing';

  const change = changeOf(target, values);
  const unchanged = change !== null && planBudgetPublish(basis, change) === null;
  const duplicate = values.app !== '' && sharesCounter(basis.entries, values, editing?.index);

  const edit = <K extends keyof BudgetFormValues>(field: K, value: BudgetFormValues[K]): void => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  };

  const submit = async (): Promise<void> => {
    if (busy || unchanged) return;
    const result = validateBudgetForm(values, editing);
    setFailure(null);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok || !change) return;
    setStage('checking');
    const outcome = await onSubmit(basis, change, note, setStage);
    setStage('editing');
    if (outcome.kind === 'invalid' || outcome.kind === 'failed') setFailure(outcome);
  };

  return (
    <Drawer open onOpenChange={next => next || busy || onClose()} size="md">
      <Drawer.Header title={editing ? 'Edit budget' : 'Add budget'} meta={editing ? budgetTitle(editing) : 'Limits what an app may spend on AI in each window.'} />
      <Drawer.Body>
        <div className={styles.form}>
          {failure?.kind === 'invalid' ? (
            <Alert intent="danger" title="The budgets were not published">
              <BudgetIssues issues={failure.issues} />
            </Alert>
          ) : null}
          {failure?.kind === 'failed' ? (
            <Alert intent="danger" title="The budgets were not published">
              {failure.message}
            </Alert>
          ) : null}
          <FormField label="App" required error={errors.app} helper={apps.length === 0 ? 'No app has features in the active catalog yet.' : undefined}>
            <Select value={values.app || undefined} onValueChange={value => edit('app', value)} placeholder="Choose an app" aria-label="App" disabled={apps.length === 0}>
              {apps.map(app => (
                <Select.Item key={app} value={app} description={app}>
                  {appName(app)}
                </Select.Item>
              ))}
            </Select>
          </FormField>
          <RadioGroup label="Applies to" value={values.per} onValueChange={value => edit('per', value as BudgetScope)}>
            {SCOPES.map(scope => (
              <RadioGroup.Item key={scope.value} value={scope.value} label={scope.label} description={scope.description} />
            ))}
          </RadioGroup>
          <FormField label="Window" helper={WINDOW_HELPER}>
            <Select value={values.window} onValueChange={value => edit('window', value as BudgetWindow)} aria-label="Window">
              {WINDOWS.map(window => (
                <Select.Item key={window.value} value={window.value}>
                  {window.label}
                </Select.Item>
              ))}
            </Select>
          </FormField>
          {duplicate ? (
            <Alert intent="warning" title="Another budget limits the same app, scope and window">
              Two budgets with the same app, scope and window share one counter; the stricter limits apply.
            </Alert>
          ) : null}
          <FormField label="API-price cost limit" optional error={errors.cost} helper="In US dollars, at the providers’ list prices, so free subscription calls count too.">
            <Input value={values.cost} onValueChange={value => edit('cost', value)} prefix="$" inputMode="decimal" placeholder="50.00" autoComplete="off" />
          </FormField>
          <FormField label="Call limit" optional error={errors.calls} helper="Set a cost limit, a call limit or both.">
            <Input value={values.calls} onValueChange={value => edit('calls', value)} inputMode="numeric" placeholder="1,000" autoComplete="off" />
          </FormField>
          <FormField label="Note" optional helper="Kept with the new catalog version in History. Left empty, it describes the change.">
            <Input value={note} onValueChange={setNote} maxLength={NOTE_MAX_LENGTH} autoComplete="off" />
          </FormField>
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        {unchanged ? <span className={styles.footerNote}>Nothing has changed yet.</span> : null}
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={stage === 'checking' || stage === 'publishing'}
          loadingText={stage === 'checking' ? 'Checking the draft…' : undefined}
          disabled={unchanged}
          onClick={() => void submit()}
        >
          Save
        </Button>
      </Drawer.Footer>
    </Drawer>
  );
}

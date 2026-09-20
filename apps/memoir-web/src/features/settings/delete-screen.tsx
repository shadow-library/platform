import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, type Ref, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, ConfirmDialog, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { meQuery } from '@/lib/apis';
import {
  accountKeys,
  DELETION_PROGRESS_COPY,
  DELETION_START_UNCONFIRMED,
  DELETION_START_UNCONFIRMED_CODE,
  DELETION_STEPS,
  DELETION_UNEXPECTED,
  type DeletionProgress,
  type DeletionStage,
  type DeletionView,
  isErasureStarted,
  notifyOutcome,
  REAUTH_EXPIRED_NOTE,
  type SettledCommandResult,
  type SettledOutcome,
  useAccountCommand,
  useDeletion,
  useMemoirData,
} from '@/lib/data';
import { formatLocalDate } from '@/lib/format';
import { signInUrl } from '@/lib/session';

import styles from './settings.module.css';

const DELETION_PATH = '/settings/delete';

const TYPED_CONFIRMATION = 'DELETE';

const PROGRESS_ORDER: DeletionProgress[] = ['pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done'];

type StepStatus = 'done' | 'active' | 'waiting';

const STEP_STATUS_LABELS: Record<StepStatus, string> = { done: 'Done', active: 'In progress', waiting: 'Not started' };

type FlowDialog = 'confirm' | 'stop';

type Unsettled = Exclude<SettledOutcome<SettledCommandResult>, { status: 'applied' }>;

interface FlowFailure {
  title?: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

const NOT_STARTED_TITLE = 'The erasure did not start';

const UNCONFIRMED_TITLE = 'We couldn’t confirm whether the erasure started';

const UNCONFIRMED_COPY: Record<Extract<DeletionStage, { kind: 'unconfirmed' }>['reason'], string> = {
  unreachable: DELETION_START_UNCONFIRMED,
  'signed-out': [
    'This tab was signed out right after the request was sent, which is what happens when an erasure starts.',
    'Sign in again to see where it stands: an account that is being erased says so as soon as you open it.',
  ].join(' '),
};

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function confirmationDescription(view: DeletionView, today: string, email: string | undefined): string {
  const sets = listNames(view.sets.map(set => set.name.toLowerCase()));
  return [
    `This erases ${sets} for ${email ?? 'the account signed in on this tab'}, then asks Shadow to close that Shadow account.`,
    'Once it is closed, signing in to any Shadow app with it stops working.',
    `The erasure starts today, ${formatLocalDate(today)}, the moment you confirm, and it cannot be stopped or undone.`,
  ].join(' ');
}

function stepStatus(progress: DeletionProgress, reachedAt: DeletionProgress, previous: DeletionProgress): StepStatus {
  const current = PROGRESS_ORDER.indexOf(progress);
  if (current >= PROGRESS_ORDER.indexOf(reachedAt)) return 'done';
  return current >= PROGRESS_ORDER.indexOf(previous) ? 'active' : 'waiting';
}

export function DeleteAccountScreen(): ReactElement {
  const deletion = useDeletion();

  return (
    <Screen
      title="Delete your data"
      subtitle="This erases everything Memoir holds about you, then asks Shadow to close your Shadow account."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      <DataState query={deletion} source="server" skeleton={<Skeleton.Card />}>
        {view => <DeletionFlow view={view} />}
      </DataState>
    </Screen>
  );
}

function useFlowFocus(stage: DeletionStage['kind'], dialog: FlowDialog | null): { heading: Ref<HTMLHeadingElement>; rememberOpener: () => void } {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const shown = useRef(stage);

  useEffect(() => {
    if (dialog !== null) return undefined;
    const stageChanged = shown.current !== stage;
    shown.current = stage;
    const previous = opener.current;
    opener.current = null;
    if (!stageChanged && !previous) return undefined;

    // Radix restores focus to the element that opened the dialog after this effect; the timer lands after it.
    const target = !stageChanged && previous?.isConnected ? previous : heading.current;
    const timer = setTimeout(() => target?.focus(), 0);
    return () => clearTimeout(timer);
  }, [stage, dialog]);

  return { heading, rememberOpener: () => void (opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null) };
}

function DeletionFlow({ view }: { view: DeletionView }): ReactElement {
  const command = useAccountCommand();
  const { queryClient, today } = useMemoirData();
  const email = useQuery(meQuery).data?.email;
  const [dialog, setDialog] = useState<FlowDialog | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const { heading, rememberOpener } = useFlowFocus(view.stage.kind, dialog);

  const openDialog = (next: FlowDialog): void => {
    rememberOpener();
    if (next === 'confirm') setAttempt(current => current + 1);
    setDialog(next);
  };

  const checkAgain = (): void => {
    setFailure(null);
    void queryClient.invalidateQueries({ queryKey: accountKeys.deletion });
  };

  const guarded = async (retry: () => void, work: () => Promise<void>): Promise<void> => {
    setFailure(null);
    try {
      await work();
    } catch {
      setFailure({ message: DELETION_UNEXPECTED, action: { label: 'Try again', onClick: retry } });
    }
  };

  const reportUnsettled = (title: string, outcome: Unsettled, retry?: () => void): void => {
    if (outcome.status !== 'rejected' && outcome.status !== 'failed') return notifyOutcome(outcome, { success: '', action: 'continue' });
    setFailure({ title, message: outcome.message, action: retry ? { label: 'Try again', onClick: retry } : undefined });
  };

  const acknowledge = (acknowledgementId: string, acknowledged: boolean): Promise<void> =>
    guarded(checkAgain, async () => {
      const outcome = await command.run({ type: 'deletion.acknowledge', acknowledgementId, acknowledged }, { dedupe: false });
      if (outcome.status !== 'applied') reportUnsettled('Couldn’t save that statement', outcome, checkAgain);
    });

  const continueToConfirmation = (): Promise<void> =>
    guarded(
      () => void continueToConfirmation(),
      async () => {
        const outcome = await command.run({ type: 'deletion.continue' });
        if (outcome.status !== 'applied') return reportUnsettled('Couldn’t continue', outcome, () => void continueToConfirmation());
        if (queryClient.getQueryData<DeletionView>(accountKeys.deletion)?.stage.kind === 'confirm') openDialog('confirm');
      },
    );

  const settleBegin = (outcome: SettledOutcome<SettledCommandResult>): void => {
    const retry = (): void => openDialog('confirm');
    if (outcome.status === 'applied') {
      // A full load: an in-app navigation lets the session guard see the revoked session first, and it drops every cached account query.
      if (isErasureStarted(outcome.local)) window.location.replace(`/erasure?device=${outcome.local.erasure.device}`);
      return;
    }
    if (outcome.status === 'refused') return;
    if (outcome.status === 'queued-offline' || outcome.status === 'superseded' || outcome.code !== DELETION_START_UNCONFIRMED_CODE) {
      return reportUnsettled(NOT_STARTED_TITLE, outcome, retry);
    }
    if (queryClient.getQueryData<DeletionView>(accountKeys.deletion)?.stage.kind === 'unconfirmed') return;
    setFailure({ title: UNCONFIRMED_TITLE, message: outcome.message, action: { label: 'Check again', onClick: checkAgain } });
  };

  const begin = (): Promise<void> =>
    guarded(
      () => openDialog('confirm'),
      async () => {
        setDialog(null);
        settleBegin(await command.run({ type: 'deletion.begin' }));
      },
    );

  const stop = (): Promise<void> =>
    guarded(
      () => openDialog('stop'),
      async () => {
        setDialog(null);
        const outcome = await command.run({ type: 'deletion.abandon' });
        if (outcome.status === 'rejected' || outcome.status === 'failed') return reportUnsettled('Couldn’t stop here', outcome, () => openDialog('stop'));
        notifyOutcome(outcome, { success: outcome.status === 'applied' ? outcome.local.message : '', action: 'stop the deletion' });
      },
    );

  const stopButton = (
    <Button
      variant="ghost"
      loading={command.isPendingFor({ type: 'deletion.abandon' })}
      loadingText="Stopping…"
      disabled={command.isPendingFor(item => item.type === 'deletion.begin' || item.type === 'deletion.abandon')}
      onClick={() => openDialog('stop')}
    >
      Stop here
    </Button>
  );

  const renderStage = (stage: DeletionStage): ReactElement => {
    switch (stage.kind) {
      case 'idle':
        return (
          <IdleStep
            view={view}
            heading={heading}
            continuing={command.isPendingFor({ type: 'deletion.continue' })}
            onAcknowledge={(acknowledgementId, acknowledged) => void acknowledge(acknowledgementId, acknowledged)}
            onContinue={() => void continueToConfirmation()}
          />
        );

      case 'awaiting-reauth':
        return (
          <Card padding="lg">
            <Card.Body>
              <h2 ref={heading} tabIndex={-1} className={styles.sectionTitle}>
                {view.reauth.title}
              </h2>
              {stage.reason === 'expired' ? (
                <Alert className={styles.flowAlert} intent="warning">
                  {REAUTH_EXPIRED_NOTE}
                </Alert>
              ) : null}
              <p className={styles.sectionNote}>{view.reauth.body}</p>
              <div className={styles.actions}>
                <Button variant="primary" asChild>
                  <a href={view.reauth.continueTo}>{view.reauth.continueLabel}</a>
                </Button>
                {stopButton}
              </div>
            </Card.Body>
          </Card>
        );

      case 'confirm':
        return (
          <Card padding="lg">
            <Card.Body>
              <h2 ref={heading} tabIndex={-1} className={styles.sectionTitle}>
                Confirm the erasure
              </h2>
              <p className={styles.sectionNote}>Your Shadow account has confirmed it is you. What is left is your own confirmation.</p>
              <p className={styles.sectionNote}>{view.terms}</p>
              <div className={styles.actions}>
                <Button variant="danger" loading={command.isPendingFor({ type: 'deletion.begin' })} loadingText="Starting the erasure…" onClick={() => openDialog('confirm')}>
                  Delete everything…
                </Button>
                {stopButton}
              </div>
            </Card.Body>
          </Card>
        );

      case 'unconfirmed':
        return (
          <Card padding="lg">
            <Card.Body>
              <h2 ref={heading} tabIndex={-1} className={styles.sectionTitle}>
                {UNCONFIRMED_TITLE}
              </h2>
              <p className={styles.sectionNote}>{UNCONFIRMED_COPY[stage.reason]}</p>
              <div className={styles.actions}>
                {stage.reason === 'signed-out' ? (
                  <Button variant="primary" onClick={() => window.location.assign(signInUrl(DELETION_PATH))}>
                    Sign in again
                  </Button>
                ) : (
                  <Button variant="primary" onClick={checkAgain}>
                    Check again
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>
        );

      case 'underway':
        return <UnderwayStep stage={stage} heading={heading} terms={view.terms} />;
    }
  };

  const content = (
    <>
      {failure ? (
        <Alert className={styles.flowAlert} intent="danger" title={failure.title} action={failure.action}>
          {failure.message}
        </Alert>
      ) : null}
      {renderStage(view.stage)}
      <ConfirmDialog
        key={attempt}
        open={dialog === 'confirm'}
        onOpenChange={open => !open && setDialog(null)}
        intent="danger"
        title="Delete all your data now?"
        description={confirmationDescription(view, today, email)}
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        typedConfirmation={TYPED_CONFIRMATION}
        onConfirm={() => void begin()}
      />
      <ConfirmDialog
        open={dialog === 'stop'}
        onOpenChange={open => !open && setDialog(null)}
        title="Stop deleting your data?"
        description="Nothing has started and nothing is erased. The two statements you ticked are cleared, so starting again begins from the top."
        confirmLabel="Stop here"
        cancelLabel="Keep going"
        onConfirm={() => void stop()}
      />
    </>
  );

  if (view.stage.kind === 'underway' || view.stage.kind === 'unconfirmed') return content;
  return <ScreenColumns aside={<LighterOptions view={view} />}>{content}</ScreenColumns>;
}

interface IdleStepProps {
  view: DeletionView;
  heading: Ref<HTMLHeadingElement>;
  continuing: boolean;
  onAcknowledge: (acknowledgementId: string, acknowledged: boolean) => void;
  onContinue: () => void;
}

function IdleStep({ view, heading, continuing, onAcknowledge, onContinue }: IdleStepProps): ReactElement {
  const [acknowledged, setAcknowledged] = useState<string[]>(view.acknowledged);
  const allAcknowledged = view.acknowledgements.every(item => acknowledged.includes(item.id));

  const toggle = (acknowledgementId: string, checked: boolean): void => {
    setAcknowledged(current => (checked ? [...current.filter(id => id !== acknowledgementId), acknowledgementId] : current.filter(id => id !== acknowledgementId)));
    onAcknowledge(acknowledgementId, checked);
  };

  return (
    <Card padding="lg">
      <Card.Body>
        <h2 ref={heading} tabIndex={-1} className={styles.sectionTitle}>
          What would be erased
        </h2>
        <div className={styles.sets}>
          {view.sets.map(set => (
            <div key={set.name} className={styles.set}>
              <div className={styles.setName}>{set.name}</div>
              <p className={styles.setMeta}>{set.meta}</p>
            </div>
          ))}
        </div>

        <h3 className={styles.sectionTitle}>How it works</h3>
        <p className={styles.sectionNote}>{view.terms}</p>

        <div className={styles.acknowledgements}>
          {view.acknowledgements.map(item => (
            <Checkbox key={item.id} checked={acknowledged.includes(item.id)} label={item.text} onCheckedChange={checked => toggle(item.id, checked === true)} />
          ))}
        </div>

        <div className={styles.actions}>
          <Button variant="danger" disabled={!allAcknowledged || continuing} loading={continuing} loadingText="Checking…" onClick={onContinue}>
            Continue to confirmation
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/settings/export">Export first</Link>
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

interface UnderwayStepProps {
  stage: Extract<DeletionStage, { kind: 'underway' }>;
  heading: Ref<HTMLHeadingElement>;
  terms: string;
}

function UnderwayStep({ stage, heading, terms }: UnderwayStepProps): ReactElement {
  const copy = DELETION_PROGRESS_COPY[stage.progress];

  return (
    <Card padding="lg">
      <Card.Body>
        <h2 ref={heading} tabIndex={-1} className={styles.sectionTitle}>
          {copy.title}
        </h2>
        <p className={styles.sectionNote}>{copy.body}</p>
        {stage.startedAt ? <p className={styles.sectionNote}>Started on {formatLocalDate(stage.startedAt)} from this device.</p> : null}
        {stage.progress === 'unknown' ? null : (
          <ol className={styles.deletionSteps}>
            {DELETION_STEPS.map((step, index) => {
              const status = stepStatus(stage.progress, step.reachedAt, DELETION_STEPS[index - 1]?.reachedAt ?? 'pending');
              return (
                <li key={step.reachedAt} className={styles.deletionStep} data-status={status}>
                  <span className={styles.deletionStepLabel}>{step.label}</span>
                  <span className={styles.deletionStepStatus}>{STEP_STATUS_LABELS[status]}</span>
                </li>
              );
            })}
          </ol>
        )}
        {stage.progress === 'done' ? null : <p className={styles.sectionNote}>{terms}</p>}
      </Card.Body>
    </Card>
  );
}

function LighterOptions({ view }: { view: DeletionView }): ReactElement {
  return (
    <Card padding="md">
      <Card.Body>
        <h2 className={screenStyles.cardTitle}>Lighter options</h2>
        <ul className={styles.alternatives}>
          {view.alternatives.map(alternative => (
            <li key={alternative.title}>
              <p className={styles.settingLabel}>{alternative.title}</p>
              <p className={styles.settingHelp}>{alternative.body}</p>
              <div className={styles.alternativeLinks}>
                {alternative.links.map(link => (
                  <Button key={link.to} size="sm" variant="secondary" asChild>
                    <Link to={link.to}>{link.label}</Link>
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card.Body>
    </Card>
  );
}

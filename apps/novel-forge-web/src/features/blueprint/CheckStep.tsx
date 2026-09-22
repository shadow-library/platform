import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import {
  buildCheckSelection,
  CHECK_REASON_MAX,
  CHECK_SLICE_LABELS,
  CHECK_TOPIC,
  checkLockIssue,
  type CheckSlice,
  chooseFix,
  clearResolution,
  dismissFinding,
  nextSlice,
  openFindings,
  parseCheckRound,
  passedCount,
  type Resolutions,
  resolveArithmetic,
  uncheckedSlices,
  writeOwnFix,
} from './check-step';
import { passRoundKey } from './engine-pass';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Checking the design…';
const LEDGER_QUERY = { topics: CHECK_TOPIC };

/** The last pass across the whole Blueprint, one slice at a time: arithmetic is one click, story problems are choices. */
export function CheckStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseCheckRound(round);

  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) setRead(true);

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setResolutions(current => Object.fromEntries(Object.entries(current).filter(([findingId]) => parsed.findings.some(finding => finding.id === findingId))));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const pending = nextSlice(parsed);
  const unchecked = uncheckedSlices(parsed);
  const open = openFindings(parsed, resolutions);
  const passed = passedCount(parsed);
  const arithmetic = parsed.findings.filter(finding => finding.kind === 'arithmetic' && !resolutions[finding.id]).length;
  const issue = checkLockIssue(parsed, resolutions);
  const selection = buildCheckSelection(parsed, resolutions);

  const run = (slice: CheckSlice | null): void => {
    startRound.mutate(buildRoundBody(steer, {}, slice ? stepPayload({ slice }) : undefined), {
      onSuccess: () => setSteer(EMPTY_STEER),
      onError: err => toast.danger(err.message),
    });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: () => {
          toast.success('The Blueprint is checked');
          onLocked();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <>
      {round == null && (
        <section className={styles.card}>
          <p className={styles.cardLede}>One pass across everything you have decided, a slice at a time — the rules against the briefs, then the cast, then the shape.</p>
        </section>
      )}

      {decidedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back what you already decided"
          action={{ label: decidedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void decidedBefore.refetch() }}
        >
          Locking now would retire the answer this screen cannot see, so it stays disabled until the Notebook loads. {decidedBefore.error?.message}
        </Alert>
      )}

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={() => run(pending)}
        retrying={startRound.isPending}
      />

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>{open.length === 0 ? 'Nothing needs you' : `${open.length} ${open.length === 1 ? 'thing needs' : 'things need'} you`}</h2>
            <span className={styles.pairCount}>{passed} checks passed</span>
          </div>
          <div className={styles.pillRow}>
            {parsed.slices.map(state => (
              <span key={state.slice} className={styles.citeChip}>
                {CHECK_SLICE_LABELS[state.slice as CheckSlice] ?? state.slice}: {state.run ? `${state.passed} passed` : 'not checked'}
              </span>
            ))}
          </div>
          {unchecked.length > 0 && (
            <div className={styles.cardActions}>
              <Button variant="secondary" disabled={busy} onClick={() => run(pending)}>
                Check {pending ? CHECK_SLICE_LABELS[pending] : 'the rest'}
              </Button>
            </div>
          )}
          {arithmetic > 0 && (
            <div className={styles.cardActions}>
              <Button variant="secondary" disabled={busy} onClick={() => setResolutions(current => resolveArithmetic(current, parsed))}>
                Fix all {arithmetic} arithmetic {arithmetic === 1 ? 'finding' : 'findings'}
              </Button>
            </div>
          )}
        </section>
      )}

      {parsed.findings.map(finding => {
        const resolution = resolutions[finding.id];
        return (
          <section key={finding.id} className={styles.card}>
            <div className={styles.pairHead}>
              <h3 className={styles.cardTitle}>{finding.title}</h3>
              <span className={styles.pairCount}>{finding.kind === 'arithmetic' ? 'One right answer' : 'Your call'}</span>
            </div>
            <p className={styles.cardLede}>{finding.detail}</p>
            <div className={styles.conceptGrid}>
              {finding.choices.map(choice => (
                <button
                  key={choice.id}
                  type="button"
                  className={styles.optionPick}
                  aria-pressed={resolution?.choiceId === choice.id && !resolution.dismissed}
                  disabled={busy}
                  onClick={() => setResolutions(current => chooseFix(current, finding.id, choice.id))}
                >
                  <span className={styles.optionTitle}>{choice.label}</span>
                  <span className={styles.optionDescription}>{choice.detail}</span>
                </button>
              ))}
            </div>
            <Input
              aria-label={`Your own fix for ${finding.title}`}
              placeholder="Write my own fix"
              value={resolution && !resolution.dismissed && !resolution.choiceId ? resolution.text : ''}
              maxLength={CHECK_REASON_MAX}
              disabled={busy}
              onValueChange={text => setResolutions(current => (text.trim() ? writeOwnFix(current, finding.id, text) : clearResolution(current, finding.id)))}
            />
            <Input
              aria-label={`Why ${finding.title} is not a problem`}
              aria-invalid={resolution?.dismissed === true && resolution.text.trim().length === 0}
              placeholder="Dismiss, and say why"
              value={resolution?.dismissed ? resolution.text : ''}
              maxLength={CHECK_REASON_MAX}
              disabled={busy}
              onValueChange={reason => setResolutions(current => (reason ? dismissFinding(current, finding.id, reason) : clearResolution(current, finding.id)))}
            />
          </section>
        );
      })}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={() => run(pending)}
          submitLabel={pending ? `Check ${CHECK_SLICE_LABELS[pending]}` : 'Check again'}
          running={busy}
          placeholder="e.g. only tell me what would stop me writing chapter one"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Resolve and finish the Blueprint'}
          hint={read ? (issue ?? 'Every resolution becomes a decision in the Notebook, and a dismissal is recorded with your reason.') : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}

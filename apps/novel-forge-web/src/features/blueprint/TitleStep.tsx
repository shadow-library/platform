import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import {
  isRoundLive,
  type TitleCheckResponse,
  useCancelBlueprintRoundMutation,
  useLedgerEntriesQuery,
  useLockBlueprintStepMutation,
  useStartBlueprintRoundMutation,
  useTitleChecksMutation,
} from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { LockBar } from './LockBar';
import { OptionCard } from './OptionCard';
import { buildRoundBody, EMPTY_STEER, type OptionVerdicts, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import {
  buildTitleSelection,
  checkableTitles,
  checksFor,
  EMPTY_TITLE_DRAFT,
  indexChecks,
  parseTitleGroups,
  restoreTitleDraft,
  TITLE_CHECK_BATCH_MAX,
  TITLE_RULED_OUT_TOPIC,
  TITLE_TEXT_MAX,
  TITLE_TOPIC,
  titleCandidates,
  type TitleChecks,
  type TitleDraft,
  titleRoundKey,
  titlesToCheck,
  toggleStar,
  workingTitleText,
} from './title-step';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Naming it from what you have decided…';
const LEDGER_QUERY = { topics: `${TITLE_TOPIC},${TITLE_RULED_OUT_TOPIC}` };

const CHECK_INTENT: Record<TitleCheckResponse['status'], 'success' | 'warning' | 'neutral'> = { ok: 'success', warn: 'warning', unknown: 'neutral' };

/** Titles grouped by style, each tied to the decision it came from; the checks say plainly what they could not check. */
export function TitleStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const groups = parseTitleGroups(round);
  const candidates = titleCandidates(groups);

  const [draft, setDraft] = useState<TitleDraft>(EMPTY_TITLE_DRAFT);
  const [restored, setRestored] = useState(false);
  const [checks, setChecks] = useState<TitleChecks>({});
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => titleRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const runChecks = useTitleChecksMutation(projectId);
  const lockedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // The lock carries the working title and the shortlist together, so a revisit starts from what the Notebook holds rather than
  // from an empty screen that would retire it — and the restore is re-applied on every new round, whose option ids are new.
  const entries = lockedBefore.data?.entries;
  if (!restored && entries != null) {
    setRestored(true);
    setDraft(current => restoreTitleDraft(current, entries, candidates));
  }

  if (titleRoundKey(round) !== roundKey) {
    setRoundKey(titleRoundKey(round));
    setSteer(EMPTY_STEER);
    setChecks({});
    setDraft(current => restoreTitleDraft({ ...EMPTY_TITLE_DRAFT, ownTitle: current.ownTitle, why: current.why }, entries ?? [], candidates));
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const selection = buildTitleSelection(draft, candidates);
  const working = workingTitleText(draft, candidates);

  const checkable = checkableTitles(candidates, draft);

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer, draft.verdicts), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const check = (): void => {
    runChecks.mutate({ titles: titlesToCheck(candidates, draft) }, { onSuccess: result => setChecks(indexChecks(result.results)), onError: err => toast.danger(err.message) });
  };

  const setVerdict = (titleId: string, verdict: OptionVerdicts[string]['verdict'] | null, reason?: string): void => {
    setDraft(current => {
      const verdicts = { ...current.verdicts };
      if (verdict == null) delete verdicts[titleId];
      else verdicts[titleId] = { verdict, ...(reason ? { reason } : {}) };
      return { ...current, verdicts, workingId: verdict === 'not' && current.workingId === titleId ? null : current.workingId };
    });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success(`“${selection.working.text}” is the working title`);
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
          <p className={styles.cardLede}>Every candidate comes from a decision you have locked, so there is nothing to name until the first round runs.</p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Show me some titles
            </Button>
          </div>
        </section>
      )}

      {lockedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back the title you locked"
          action={{ label: lockedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void lockedBefore.refetch() }}
        >
          Locking now would replace it with a screen that never saw it, so it stays disabled until the Notebook loads. {lockedBefore.error?.message}
        </Alert>
      )}

      <RoundStatus
        round={round}
        runningLabel={RUNNING_LABEL}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {groups.map(group => (
        <section key={group.style} className={styles.card}>
          <h2 className={styles.cardTitle}>{group.label}</h2>
          <div className={styles.conceptGrid}>
            {group.titles.map(candidate => {
              const result = checksFor(checks, candidate.text);
              return (
                <OptionCard
                  key={candidate.id}
                  title={candidate.text}
                  description={`From ${candidate.from}`}
                  selected={draft.workingId === candidate.id && !draft.ownTitle.trim()}
                  onSelect={() => setDraft(current => ({ ...current, workingId: current.workingId === candidate.id ? null : candidate.id, ownTitle: '' }))}
                  verdict={draft.verdicts[candidate.id]?.verdict ?? null}
                  verdictReason={draft.verdicts[candidate.id]?.reason}
                  onVerdict={(verdict, reason) => setVerdict(candidate.id, verdict, reason)}
                  disabled={busy}
                  footer={
                    <div className={styles.cardActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-pressed={draft.starred.includes(candidate.id)}
                        disabled={busy}
                        onClick={() => setDraft(current => ({ ...current, starred: toggleStar(current.starred, candidate.id) }))}
                      >
                        {draft.starred.includes(candidate.id) ? '★ Starred' : '☆ Star'}
                      </Button>
                      {result != null && (
                        <>
                          <StatusChip intent={CHECK_INTENT[result.catalogFit.status]}>{result.catalogFit.detail}</StatusChip>
                          <StatusChip intent={CHECK_INTENT[result.library.status]}>{result.library.detail}</StatusChip>
                          <StatusChip intent={CHECK_INTENT[result.published.status]}>{result.published.detail}</StatusChip>
                        </>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        </section>
      ))}

      {round != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Checks</h2>
          <p className={styles.cardLede}>
            Whether a title fits a catalog card and whether another novel of yours already has it. Similar published titles are not checked here, and the check says so rather than
            passing.
            {checkable.length > TITLE_CHECK_BATCH_MAX &&
              ` One run checks the first ${TITLE_CHECK_BATCH_MAX} of the ${checkable.length} titles on screen — rule some out, or run it again once you have.`}
          </p>
          <div className={styles.cardActions}>
            <Button size="sm" loading={runChecks.isPending} disabled={busy || runChecks.isPending || checkable.length === 0} onClick={check}>
              Run the checks
            </Button>
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Or name it yourself</h2>
          <Input
            aria-label="Your own title"
            placeholder="e.g. The Ledger of Small Debts"
            value={draft.ownTitle}
            onValueChange={ownTitle => setDraft(current => ({ ...current, ownTitle, workingId: ownTitle.trim() ? null : current.workingId }))}
            maxLength={TITLE_TEXT_MAX}
            disabled={busy}
          />
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="More titles"
          running={busy}
          placeholder='e.g. short, no "shadow" or "sovereign", should hint at debt'
        />
      )}

      {candidates.length > 0 && (
        <LockBar
          label={working ? `Use “${working}” for now` : (meta.lockLabel ?? 'Use this title for now')}
          hint={restored ? 'A working title. It is asked again after the chapter 1–3 read-through and before first publish.' : 'Reading back what you already locked…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!restored || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}

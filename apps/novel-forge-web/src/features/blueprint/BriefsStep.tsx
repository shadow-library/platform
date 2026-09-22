import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import {
  briefBeats,
  BRIEFS_LINE_MAX,
  BRIEFS_NAME_MAX,
  BRIEFS_TOPIC,
  BRIEFS_WHY_MAX,
  BRIEFS_WRITER_LINE_MAX,
  type BriefsDraft,
  briefsDraftAnchor,
  briefsDraftFrom,
  briefsLockIssue,
  buildBriefsSelection,
  citeChip,
  editBrief,
  nextBriefsDraft,
  parseBriefsRound,
  resolveBriefsDraft,
  restoreBriefsDraft,
  reviseBriefInput,
} from './briefs-step';
import { passRoundKey, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Briefing arc one…';
const LEDGER_QUERY = { topics: BRIEFS_TOPIC };

/** Arc one's chapter briefs: the chapter list, one brief in full, and a steer that revises that brief alone. */
export function BriefsStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseBriefsRound(round);

  const [draft, setDraft] = useState<BriefsDraft>(() => briefsDraftFrom(parsed));
  const [offered, setOffered] = useState<BriefsDraft>(() => briefsDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [openAt, setOpenAt] = useState(0);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreBriefsDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? resolveBriefsDraft(locked, parsed) : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextBriefsDraft(current, offered, parsed));
    setOffered(briefsDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const at = Math.min(openAt, Math.max(draft.briefs.length - 1, 0));
  const open = draft.briefs[at];
  const detail = open ? (parsed.briefs.find(brief => brief.chapter === open.chapter) ?? null) : null;
  const anchor = briefsDraftAnchor(draft);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const issue = briefsLockIssue(draft, parsed);
  const selection = buildBriefsSelection(draft, parsed);

  const patch = (next: Partial<BriefsDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (chapter: number | null): void => {
    startRound.mutate(buildRoundBody(steer, {}, reviseBriefInput(chapter)), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: () => {
          toast.success('Arc one is briefed');
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
          <p className={styles.cardLede}>This screen fills itself in once volume one has arcs. Only arc one is briefed here; later arcs are briefed in the Workspace.</p>
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
        onRetry={() => run(null)}
        retrying={startRound.isPending}
      />

      {round != null && draft.briefs.length > 0 && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>{parsed.arcTitle ? `Arc one · ${parsed.arcTitle}` : 'Arc one'}</h2>
            <span className={styles.pairCount}>
              {draft.briefs.length} chapters · chapter {open?.chapter ?? parsed.chapterStart} open
            </span>
          </div>
          <p className={styles.cardLede}>Read chapter one’s brief properly and skim the rest. Each brief cites the Story Bible pages the chapter is written from.</p>

          <div className={styles.briefsLayout}>
            <ol className={styles.chapterList}>
              {draft.briefs.map((brief, index) => (
                <li key={brief.chapter}>
                  <button type="button" className={styles.chapterRow} aria-pressed={index === at} onClick={() => setOpenAt(index)}>
                    <em>{brief.chapter}</em>
                    <span>{brief.title || 'Untitled'}</span>
                  </button>
                </li>
              ))}
            </ol>

            {open && (
              <div className={styles.editFields}>
                <div className={styles.memberHead}>
                  <Input
                    aria-label={`Title of chapter ${open.chapter}`}
                    placeholder="Chapter title"
                    value={open.title}
                    maxLength={BRIEFS_NAME_MAX}
                    disabled={busy}
                    onValueChange={title => patch({ briefs: editBrief(draft.briefs, at, { title }) })}
                  />
                  <Input
                    aria-label={`POV of chapter ${open.chapter}`}
                    placeholder="POV"
                    value={open.pov}
                    maxLength={BRIEFS_NAME_MAX}
                    disabled={busy}
                    onValueChange={pov => patch({ briefs: editBrief(draft.briefs, at, { pov }) })}
                  />
                </div>
                <Input
                  aria-label={`What chapter ${open.chapter} is for`}
                  placeholder="What this chapter is for"
                  value={open.purpose}
                  maxLength={BRIEFS_LINE_MAX}
                  disabled={busy}
                  onValueChange={purpose => patch({ briefs: editBrief(draft.briefs, at, { purpose }) })}
                />
                {detail && (
                  <dl className={styles.conceptDetail}>
                    <dt>Beats</dt>
                    <dd>
                      <ol className={styles.beatList}>
                        {briefBeats(detail).map((beat, index) => (
                          <li key={index}>{beat}</li>
                        ))}
                      </ol>
                    </dd>
                    <dt>Ends on</dt>
                    <dd>{detail.endsOn}</dd>
                    <dt>Must not resolve</dt>
                    <dd>{detail.mustNotResolve}</dd>
                    <dt>Cites</dt>
                    <dd>
                      <div className={styles.pillRow}>
                        {detail.cites.map(ref => {
                          const chip = citeChip(ref);
                          return (
                            <span key={ref} className={styles.citeChip}>
                              {chip.kind}: {chip.label}
                            </span>
                          );
                        })}
                        {detail.cites.length === 0 && <span className={styles.cardLede}>Nothing cited yet.</span>}
                      </div>
                    </dd>
                  </dl>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why these briefs"
              placeholder="Why these briefs"
              value={why.text}
              maxLength={BRIEFS_WHY_MAX}
              disabled={busy}
              onValueChange={textValue => patch({ why: anchorLine(textValue, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the shape of arc one means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the shape of arc one means for whoever writes chapter one"
              value={writerLine.text}
              maxLength={BRIEFS_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={textValue => patch({ writerLine: anchorLine(textValue, anchor) })}
            />
            {writerLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={() => run(open?.chapter ?? null)}
          submitLabel={open ? `Revise chapter ${open.chapter}` : 'Revise brief'}
          running={busy}
          placeholder="e.g. open mid-action and cut the walk to the door"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock arc one’s briefs'}
          hint={
            read ? (issue ?? 'Locking writes a chapter brief for every chapter of arc one, each citing the pages it is written from.') : 'Reading back what you already decided…'
          }
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
          secondary={
            <Button variant="secondary" disabled={busy} onClick={() => run(null)}>
              Rewrite every brief
            </Button>
          }
        />
      )}
    </>
  );
}

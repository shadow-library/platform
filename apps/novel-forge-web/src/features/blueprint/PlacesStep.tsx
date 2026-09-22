import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { PassSliceAlert } from './PassSliceAlert';
import {
  BACKLOG_MAX,
  BACKLOG_TEST,
  backlogPlace,
  buildPlacesSelection,
  editBacklogItem,
  editPlace,
  nextPlacesDraft,
  parsePlacesRound,
  PLACE_DEPTH_LABELS,
  PLACE_KIND_LABELS,
  type PlaceDepth,
  type PlaceKind,
  PLACES_BACKLOG_TOPIC,
  PLACES_LINE_MAX,
  PLACES_MAX,
  PLACES_NAME_MAX,
  PLACES_TOPIC,
  PLACES_WHY_MAX,
  PLACES_WRITER_LINE_MAX,
  type PlacesDraft,
  placesDraftAnchor,
  placesDraftFrom,
  placesLockIssue,
  restorePlacesDraft,
} from './places-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Placing volume one…';
const LEDGER_QUERY = { topics: `${PLACES_TOPIC},${PLACES_BACKLOG_TOPIC}` };
const KINDS: PlaceKind[] = ['place', 'faction'];
const DEPTHS: PlaceDepth[] = ['deep', 'sketch'];

/** Where volume one happens, in detail; everywhere else a sketch; and everything that changes no sentence yet in the backlog. */
export function PlacesStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parsePlacesRound(round);

  const [draft, setDraft] = useState<PlacesDraft>(() => placesDraftFrom(parsed));
  const [offered, setOffered] = useState<PlacesDraft>(() => placesDraftFrom(parsed));
  const [read, setRead] = useState(false);
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restorePlacesDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, offered) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setDraft(current => nextPlacesDraft(current, offered, parsed));
    setOffered(placesDraftFrom(parsed));
  }

  const busy = isRoundLive(round) || startRound.isPending;
  const anchor = placesDraftAnchor(draft);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const issue = placesLockIssue(draft);
  const selection = buildPlacesSelection(draft);
  const places = draft.places.length < PLACES_MAX ? [...draft.places, { name: '', kind: 'place' as const, detail: 'sketch' as const, summary: '', usedIn: '' }] : draft.places;
  const backlog = draft.backlog.length < BACKLOG_MAX ? [...draft.backlog, { item: '', why: '' }] : draft.backlog;

  const patch = (next: Partial<PlacesDraft>): void => setDraft(current => ({ ...current, ...next }));

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('The places are locked');
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
          <p className={styles.cardLede}>This screen fills itself in when volume one is designed — start it from the cast screen.</p>
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

      <PassSliceAlert
        moved={step.sliceMoved}
        onAdopt={
          busy || sameJson(draft, offered)
            ? undefined
            : () => {
                setDraft(placesDraftFrom(parsed));
                setOffered(placesDraftFrom(parsed));
              }
        }
      />

      <RoundStatus
        round={round}
        runningLabel={passRunningLabel(round, step.key, RUNNING_LABEL)}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>Places and factions</h2>
            <span className={styles.pairCount}>{BACKLOG_TEST}</span>
          </div>
          <div className={styles.editFields}>
            {places.map((place, index) => (
              <div key={index} className={styles.placeCard}>
                <div className={styles.memberHead}>
                  <Input
                    aria-label={`Place ${index + 1}`}
                    placeholder="Name"
                    value={place.name}
                    maxLength={PLACES_NAME_MAX}
                    disabled={busy}
                    onValueChange={name => patch({ places: editPlace(places, index, { name }) })}
                  />
                  <div className={styles.pillRow}>
                    {KINDS.map(kind => (
                      <button
                        key={kind}
                        type="button"
                        className={styles.pill}
                        aria-pressed={place.kind === kind}
                        disabled={busy}
                        onClick={() => patch({ places: editPlace(places, index, { kind }) })}
                      >
                        {PLACE_KIND_LABELS[kind]}
                      </button>
                    ))}
                    {DEPTHS.map(detail => (
                      <button
                        key={detail}
                        type="button"
                        className={styles.pill}
                        aria-pressed={place.detail === detail}
                        disabled={busy}
                        onClick={() => patch({ places: editPlace(places, index, { detail }) })}
                      >
                        {PLACE_DEPTH_LABELS[detail]}
                      </button>
                    ))}
                    <Button size="sm" variant="ghost" disabled={busy || !place.name.trim()} onClick={() => setDraft(current => backlogPlace({ ...current, places }, index))}>
                      Backlog it
                    </Button>
                  </div>
                </div>
                <Input
                  aria-label={`What place ${index + 1} is`}
                  placeholder="What it is, in one line"
                  value={place.summary}
                  maxLength={PLACES_LINE_MAX}
                  disabled={busy}
                  onValueChange={summary => patch({ places: editPlace(places, index, { summary }) })}
                />
                <Input
                  aria-label={`Where place ${index + 1} is used`}
                  placeholder="Where it is used, e.g. arc 1"
                  value={place.usedIn}
                  maxLength={PLACES_NAME_MAX}
                  disabled={busy}
                  onValueChange={usedIn => patch({ places: editPlace(places, index, { usedIn }) })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>Backlog: not before chapter 20</h2>
            <span className={styles.pairCount}>{draft.backlog.length} kept for later</span>
          </div>
          <p className={styles.cardLede}>A backlog entry is a promise to come back to an idea, never a refusal of it. Nothing here is ruled out.</p>
          <div className={styles.editFields}>
            {backlog.map((entry, index) => (
              <div key={index} className={styles.ladderRow}>
                <Input
                  aria-label={`Backlog item ${index + 1}`}
                  placeholder="The idea"
                  value={entry.item}
                  maxLength={PLACES_LINE_MAX}
                  disabled={busy}
                  onValueChange={item => patch({ backlog: editBacklogItem(backlog, index, { item }) })}
                />
                <Input
                  aria-label={`Why backlog item ${index + 1} waits`}
                  placeholder="Why it can wait"
                  value={entry.why}
                  maxLength={PLACES_LINE_MAX}
                  disabled={busy}
                  onValueChange={text => patch({ backlog: editBacklogItem(backlog, index, { why: text }) })}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {round != null && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why these places"
              placeholder="Why these places"
              value={why.text}
              maxLength={PLACES_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What these places mean for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What these places mean for whoever writes chapter one"
              value={writerLine.text}
              maxLength={PLACES_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ writerLine: anchorLine(text, anchor) })}
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
          onSubmit={run}
          submitLabel="Revise the places"
          running={busy}
          placeholder="e.g. the quarter should feel cramped"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock places and factions'}
          hint={read ? (issue ?? 'Locking writes a record and a page section per place, and a Notebook entry per backlog item.') : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}

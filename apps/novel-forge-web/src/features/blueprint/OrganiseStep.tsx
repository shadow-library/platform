import { type ReactElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ORGANISE_ACCEPTED_TOPIC,
  ORGANISE_REASON_MAX,
  ORGANISE_RULED_OUT_TOPIC,
  ORGANISE_TOPIC,
  type OrganiseSource,
  TIMELINE_BAND_LABELS,
  TIMELINE_BANDS,
  type TimelineBand,
} from '@shadow-library/sdk';
import { Alert, Button, Checkbox, Input, Select, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { lockedDecision } from './engine-pass';
import { LockBar } from './LockBar';
import {
  answerSuggestion,
  AUTHOR_BRIEF_TOPIC,
  buildOrganiseSelection,
  eventsByBand,
  mergeRestored,
  moveEvent,
  needsWords,
  nextOrganiseDraft,
  ORGANISE_SOURCE_LABELS,
  organiseCounts,
  type OrganiseDraft,
  organiseDraftFrom,
  organiseFailureMessage,
  organiseLockIssue,
  organiseLockSummary,
  organiseNotesChanged,
  organiseOverview,
  type OrganisePage,
  organiseRemovals,
  type OrganiseRound,
  organiseRoundFeedback,
  organiseRunningLabel,
  type OrganiseSuggestion,
  pageAllInferred,
  pageInclusion,
  pageSectionLabel,
  parseOrganiseRound,
  reasonLength,
  RECORD_TYPE_LABELS,
  recordsByType,
  restoreOrganiseDraft,
  suggestionPage,
  togglePage,
  unbackedPages,
} from './organise-step';
import { buildRoundBody, EMPTY_STEER, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { countWords } from './start-step';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const LEDGER_QUERY = { topics: [ORGANISE_TOPIC, ORGANISE_ACCEPTED_TOPIC, ORGANISE_RULED_OUT_TOPIC, AUTHOR_BRIEF_TOPIC].join(',') };
const ANNOUNCEMENT_CLEAR_MS = 1_000;
const OPEN_GROUP_MAX = 8;
const QUESTION_LABEL = 'The organiser’s question — not from your notes';

const whenTriggerId = (eventId: string): string => `organise-when-${eventId}`;
const regionId = (key: string): string => `organise-region-${key}`;
const suggestionTextId = (suggestionId: string): string => `organise-suggestion-${suggestionId}`;
const roundKeyOf = (round: { id: string; options: unknown } | null): string => (round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`);

function SourceChip({ source }: { source: OrganiseSource }): ReactElement {
  return <StatusChip intent={source === 'notes' ? 'neutral' : 'warning'}>{ORGANISE_SOURCE_LABELS[source]}</StatusChip>;
}

interface GroupProps {
  id: string;
  /** What the group lists, as the toggle names it: "Show events: Later". */
  noun: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A labelled group with a count whose list can be folded away; the toggle names the group, so every one reads differently to a screen reader. */
function Group({ id, noun, label, count, open, onToggle, children }: GroupProps): ReactElement {
  return (
    <div className={styles.organiseGroup}>
      <div className={styles.organisePageHead}>
        <h3 className={styles.nbGroupLabel}>
          {label} · {count}
        </h3>
        <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={open ? regionId(id) : undefined} onClick={onToggle}>
          {open ? `Hide ${noun}: ${label}` : `Show ${noun}: ${label}`}
        </Button>
      </div>
      {open && (
        <ul id={regionId(id)} className={styles.chipList}>
          {children}
        </ul>
      )}
    </div>
  );
}

export function OrganiseStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseOrganiseRound(round) ?? parseOrganiseRound(step.lastReadyRound);

  const [shown, setShown] = useState<OrganiseRound | null>(parsed);
  const [draft, setDraft] = useState<OrganiseDraft>(() => organiseDraftFrom(parsed));
  const [offered, setOffered] = useState<OrganiseDraft>(() => organiseDraftFrom(parsed));
  const [roundKey, setRoundKey] = useState(() => roundKeyOf(round));
  const [restoredFor, setRestoredFor] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocusRef = useRef<string | null>(null);

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);
  const entries = decidedBefore.data?.entries ?? null;

  // A round still running, or one that stopped, has nothing new to show: the last good organisation stays on screen, and lockable, until a new one is ready.
  if (roundKeyOf(round) !== roundKey) {
    setRoundKey(roundKeyOf(round));
    setSteer(EMPTY_STEER);
    if (parsed != null && parsed.round !== shown?.round) {
      setDraft(current => nextOrganiseDraft(current, offered, shown, parsed));
      setOffered(organiseDraftFrom(parsed));
      setShown(parsed);
      setOpen({});
    }
  }
  const view = shown ?? parsed;

  // A revisit locks the whole answer again, so what the author already added is put back — under whatever they have touched since.
  if (entries != null && view != null && restoredFor !== view.round) {
    setRestoredFor(view.round);
    const restored = restoreOrganiseDraft(entries, view);
    if (restored) setDraft(current => mergeRestored(current, offered, restored));
  }

  // Moving an event between bands re-parents its row into another list, which drops keyboard focus; it is restored once the move has painted.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    document.getElementById(target)?.focus();
  }, [draft]);

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const busy = isRoundLive(round) || startRound.isPending;
  const read = entries != null;
  const locked = entries != null && lockedDecision(entries, ORGANISE_TOPIC) != null;
  const notesWords = countWords(entries?.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '');
  const notesChanged = entries != null && organiseNotesChanged(view, entries);
  const counts = view ? organiseCounts(view, draft) : null;
  const removals = view && entries ? organiseRemovals(entries, view, draft) : { records: [], pages: 0 };
  const issue = view ? organiseLockIssue(view, draft) : null;
  const selection = view ? buildOrganiseSelection(view, draft) : null;

  const isOpen = (key: string, size: number): boolean => open[key] ?? size <= OPEN_GROUP_MAX;
  const toggleOpen = (key: string, size: number): void => setOpen(current => ({ ...current, [key]: !isOpen(key, size) }));

  const run = (withSteer: boolean): void => {
    startRound.mutate(buildRoundBody(withSteer ? steer : EMPTY_STEER, organiseRoundFeedback(view, draft)), {
      onSuccess: () => setSteer(EMPTY_STEER),
      onError: err => toast.danger(err.message),
    });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('Your notes are in your Story Bible');
          onLocked();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const move = (eventId: string, text: string, band: TimelineBand): void => {
    pendingFocusRef.current = whenTriggerId(eventId);
    setOpen(current => ({ ...current, [`band-${band}`]: true }));
    setAnnouncement(`“${text}” moved to ${TIMELINE_BAND_LABELS[band]}`);
    setDraft(current => moveEvent(current, eventId, band));
  };

  const toggle = (kind: 'records' | 'rules' | 'questions' | 'sections', id: string, kept: boolean): void => {
    setDraft(current => ({ ...current, [kind]: { ...current[kind], [id]: kept } }));
  };

  const renderPage = (page: OrganisePage): ReactElement => {
    const inclusion = pageInclusion(page, draft);
    const expanded = open[page.id] === true;
    const inferred = page.sections.filter(section => section.source === 'inferred').length;
    const allInferred = pageAllInferred(page);
    const unbacked = view != null && unbackedPages(view, draft).some(candidate => candidate.id === page.id);
    const detail = `${pageSectionLabel(page)} · ${page.sections.length} ${page.sections.length === 1 ? 'section' : 'sections'}${inferred > 0 ? `, ${inferred} inferred` : ''}`;
    return (
      <li key={page.id} className={styles.organisePage}>
        <div className={styles.organisePageHead}>
          <Checkbox
            label={page.title}
            description={allInferred ? `${detail}. Every section here is inferred — choose them one by one below.` : detail}
            checked={inclusion === 'all' ? true : inclusion === 'some' ? 'indeterminate' : false}
            disabled={busy || allInferred}
            onCheckedChange={() => setDraft(current => togglePage(current, page))}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-controls={expanded ? regionId(page.id) : undefined}
            aria-label={`${expanded ? 'Hide sections' : 'Show sections'} of “${page.title}”`}
            onClick={() => setOpen(current => ({ ...current, [page.id]: !expanded }))}
          >
            {expanded ? 'Hide sections' : 'Show sections'}
          </Button>
        </div>
        {unbacked && <p className={styles.organiseWarning}>This page needs at least one record kept that is {needsWords(page.needs)}.</p>}
        {expanded && (
          <ul id={regionId(page.id)} className={styles.chipList}>
            {page.sections.map(section => (
              <li key={section.id} className={styles.organiseSection}>
                <div className={styles.organisePageHead}>
                  <Checkbox
                    label={
                      <>
                        {section.heading}
                        <span className={styles.srOnly}> on “{page.title}”</span>
                      </>
                    }
                    checked={draft.sections[section.id] === true}
                    disabled={busy}
                    onCheckedChange={checked => toggle('sections', section.id, checked === true)}
                  />
                  <SourceChip source={section.source} />
                </div>
                <p className={styles.organiseText}>{section.body}</p>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const renderSuggestion = (suggestion: OrganiseSuggestion, index: number): ReactElement => {
    const answer = draft.suggestions[suggestion.id] ?? { verdict: null, reason: '' };
    const page = view ? suggestionPage(view, suggestion) : undefined;
    const pageLeftOut = page == null || pageInclusion(page, draft) === 'none';
    const reasonCount = reasonLength(answer.reason);
    const set = (verdict: 'accept' | 'reject'): void => {
      const next = answer.verdict === verdict ? null : verdict;
      setAnnouncement(next === null ? `Suggestion ${index + 1} left undecided` : `Suggestion ${index + 1} ${next === 'accept' ? 'accepted' : 'turned down'}`);
      setDraft(current => answerSuggestion(current, suggestion.id, { verdict: next, reason: next === 'reject' ? answer.reason : '' }));
    };
    return (
      <li key={suggestion.id} className={styles.organisePage}>
        <div className={styles.organisePageHead}>
          <StatusChip intent="ai">Suggested — not from your notes</StatusChip>
          <div className={styles.cardActions}>
            <Button
              size="sm"
              variant={answer.verdict === 'accept' ? 'primary' : 'secondary'}
              aria-pressed={answer.verdict === 'accept'}
              aria-label={`Accept suggestion ${index + 1}`}
              aria-describedby={suggestionTextId(suggestion.id)}
              disabled={busy || (pageLeftOut && answer.verdict !== 'accept')}
              onClick={() => set('accept')}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant={answer.verdict === 'reject' ? 'primary' : 'secondary'}
              aria-pressed={answer.verdict === 'reject'}
              aria-label={`Turn down suggestion ${index + 1}`}
              aria-describedby={suggestionTextId(suggestion.id)}
              disabled={busy}
              onClick={() => set('reject')}
            >
              Turn down
            </Button>
          </div>
        </div>
        <p id={suggestionTextId(suggestion.id)} className={styles.optionTitle}>
          {suggestion.text}
        </p>
        <p className={styles.organiseText}>Why: {suggestion.why}</p>
        <p className={styles.cardLede}>
          Would go in “{page?.title ?? 'a page'}”, under “{suggestion.section}”.
        </p>
        {pageLeftOut && <p className={styles.organiseWarning}>That page is left out. Keep part of it to accept this.</p>}
        {answer.verdict === 'reject' && (
          <>
            <Input
              aria-label={`Why you turned down suggestion ${index + 1} (optional)`}
              aria-describedby={`${suggestionTextId(suggestion.id)}-count`}
              aria-invalid={reasonCount > ORGANISE_REASON_MAX || undefined}
              placeholder="Why not? Optional…"
              value={answer.reason}
              disabled={busy}
              onValueChange={reason => setDraft(current => answerSuggestion(current, suggestion.id, { verdict: 'reject', reason }))}
            />
            <span id={`${suggestionTextId(suggestion.id)}-count`} className={styles.steerCount} data-over={reasonCount > ORGANISE_REASON_MAX || undefined} aria-live="polite">
              {reasonCount.toLocaleString()} / {ORGANISE_REASON_MAX.toLocaleString()}
            </span>
          </>
        )}
      </li>
    );
  };

  return (
    <>
      {round == null && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Turn your notes into a starting Story Bible</h2>
          <p className={styles.cardLede}>
            One long read of everything you wrote: pages in your own terms, a timeline that keeps each event where you placed it, and the questions your notes leave open. Anything
            the model would add is kept apart as a suggestion. It usually takes a few minutes, longer for long notes, and nothing is added to your Story Bible until you choose.
          </p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={startRound.isPending} disabled={busy} onClick={() => run(false)}>
              Organise my notes
            </Button>
            <span className={styles.cardLede}>Optional — you can skip it from the sidebar and come back later.</span>
          </div>
        </section>
      )}

      {decidedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back what you already added"
          action={{ label: decidedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void decidedBefore.refetch() }}
        >
          Adding now would replace what this screen cannot see, so it stays disabled until the Notebook loads. {decidedBefore.error?.message}
        </Alert>
      )}

      {notesChanged && !busy && (
        <Alert intent="warning" title="Your notes changed after they were organised" action={{ label: 'Organise them again', onClick: () => run(false) }}>
          What you see here was read from an earlier version of your starting point, so it may miss what you wrote since.
        </Alert>
      )}

      <RoundStatus
        round={round}
        runningLabel={organiseRunningLabel(notesWords)}
        failedMessage={organiseFailureMessage(round?.error ?? null, notesWords, view != null)}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={() => run(false)}
        retrying={startRound.isPending}
      />

      <span className={styles.srOnly} aria-live="polite">
        {announcement}
      </span>

      {view != null && counts != null && (
        <>
          {locked && (
            <Alert intent="info" title="Already in your Story Bible">
              Adding again replaces what this step added before. A page section or record that you or a later step changed since is left alone. The timeline and open questions
              pages are rewritten each time, keeping any section you added to them yourself.
            </Alert>
          )}

          <section className={styles.card} aria-labelledby="organise-reading">
            <div className={styles.pairHead}>
              <h2 id="organise-reading" className={styles.cardTitle}>
                How your notes read
              </h2>
              <StatusChip intent="neutral">A summary — not saved</StatusChip>
            </div>
            <p className={styles.cardLede}>{organiseOverview(view, counts)}</p>
            <p className={styles.organiseText}>{view.reading}</p>
          </section>

          <section className={styles.card} aria-labelledby="organise-suggestions">
            <div className={styles.pairHead}>
              <h2 id="organise-suggestions" className={styles.cardTitle}>
                Suggestions
              </h2>
              <span className={styles.pairCount}>
                {counts.undecided} to decide · {counts.accepted} accepted · {counts.rejected} turned down
              </span>
            </div>
            <p className={styles.cardLede}>Ideas the model would add. None is used unless you accept it, and one you turn down is never offered again.</p>
            {view.suggestions.length === 0 ? (
              <p className={styles.cardLede}>No suggestions this time — everything below comes from your notes.</p>
            ) : (
              <ul className={styles.chipList}>{view.suggestions.map(renderSuggestion)}</ul>
            )}
          </section>

          <section className={styles.card} aria-labelledby="organise-timeline">
            <div className={styles.pairHead}>
              <h2 id="organise-timeline" className={styles.cardTitle}>
                Timeline
              </h2>
              <StatusChip intent="neutral">From your notes</StatusChip>
            </div>
            <p className={styles.cardLede}>
              Where your notes place each event. Move anything in the wrong place — especially what isn’t placed yet. Only planning steps read the timeline; whoever writes a
              chapter never sees it.
            </p>
            {view.timeline.length === 0 ? (
              <p className={styles.cardLede}>Your notes don’t place any events in time.</p>
            ) : (
              eventsByBand(view, draft)
                .filter(group => group.events.length > 0)
                .map(group => (
                  <Group
                    key={group.band}
                    id={`band-${group.band}`}
                    noun="events"
                    label={TIMELINE_BAND_LABELS[group.band]}
                    count={group.events.length}
                    open={isOpen(`band-${group.band}`, group.events.length)}
                    onToggle={() => toggleOpen(`band-${group.band}`, group.events.length)}
                  >
                    {group.events.map(event => (
                      <li key={event.id} className={styles.organiseRow}>
                        <Checkbox
                          label={event.event}
                          checked={draft.events[event.id]?.kept === true}
                          disabled={busy}
                          onCheckedChange={checked =>
                            setDraft(current => ({ ...current, events: { ...current.events, [event.id]: { band: group.band, kept: checked === true } } }))
                          }
                        />
                        <Select
                          triggerId={whenTriggerId(event.id)}
                          size="sm"
                          value={group.band}
                          disabled={busy}
                          aria-label={`When “${event.event}” happens`}
                          onValueChange={band => move(event.id, event.event, band as TimelineBand)}
                        >
                          {TIMELINE_BANDS.map(band => (
                            <Select.Item key={band} value={band}>
                              {TIMELINE_BAND_LABELS[band]}
                            </Select.Item>
                          ))}
                        </Select>
                      </li>
                    ))}
                  </Group>
                ))
            )}
          </section>

          <section className={styles.card} aria-labelledby="organise-pages">
            <div className={styles.pairHead}>
              <h2 id="organise-pages" className={styles.cardTitle}>
                Story Bible pages
              </h2>
              <span className={styles.pairCount}>
                {counts.pages} of {view.pages.length} kept
              </span>
            </div>
            <p className={styles.cardLede}>What your notes say of the story as it opens, one page per subject. Anything marked inferred stays out unless you tick it.</p>
            {view.pages.length === 0 ? (
              <p className={styles.cardLede}>Nothing in your notes needed a page of its own.</p>
            ) : (
              <ul className={styles.chipList}>{view.pages.map(renderPage)}</ul>
            )}
          </section>

          <section className={styles.card} aria-labelledby="organise-records">
            <div className={styles.pairHead}>
              <h2 id="organise-records" className={styles.cardTitle}>
                Records
              </h2>
              <span className={styles.pairCount}>
                {counts.records} of {view.records.length} kept
              </span>
            </div>
            <p className={styles.cardLede}>The people, places and ideas your pages describe, as a reader first meets them.</p>
            {view.records.length === 0 ? (
              <p className={styles.cardLede}>Your notes name no one and nothing that needs a record yet.</p>
            ) : (
              recordsByType(view).map(group => (
                <Group
                  key={group.type}
                  id={`records-${group.type}`}
                  noun="records"
                  label={RECORD_TYPE_LABELS[group.type]}
                  count={group.records.length}
                  open={isOpen(`records-${group.type}`, group.records.length)}
                  onToggle={() => toggleOpen(`records-${group.type}`, group.records.length)}
                >
                  {group.records.map(record => (
                    <li key={record.id} className={styles.organisePageHead}>
                      <Checkbox
                        label={
                          <>
                            {record.name}
                            <span className={styles.srOnly}> ({RECORD_TYPE_LABELS[group.type].toLowerCase()})</span>
                          </>
                        }
                        description={record.summary}
                        checked={draft.records[record.id] === true}
                        disabled={busy}
                        onCheckedChange={checked => toggle('records', record.id, checked === true)}
                      />
                      <SourceChip source={record.source} />
                    </li>
                  ))}
                </Group>
              ))
            )}
          </section>

          <section className={styles.card} aria-labelledby="organise-rules">
            <div className={styles.pairHead}>
              <h2 id="organise-rules" className={styles.cardTitle}>
                Rules the writer must never break
              </h2>
              <StatusChip intent="neutral">From your notes</StatusChip>
            </div>
            <p className={styles.cardLede}>Kept in your Notebook, so every later step is held to them from chapter one.</p>
            {view.rules.length === 0 ? (
              <p className={styles.cardLede}>Your notes state no hard rules.</p>
            ) : (
              <ul className={styles.chipList}>
                {view.rules.map(rule => (
                  <li key={rule.id}>
                    <Checkbox label={rule.rule} checked={draft.rules[rule.id] === true} disabled={busy} onCheckedChange={checked => toggle('rules', rule.id, checked === true)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.card} aria-labelledby="organise-questions">
            <div className={styles.pairHead}>
              <h2 id="organise-questions" className={styles.cardTitle}>
                Open questions
              </h2>
              <StatusChip intent="ai">{QUESTION_LABEL}</StatusChip>
            </div>
            <p className={styles.cardLede}>
              What your notes leave open or undecided, most important first. They go on a page only planning steps read, so you can answer them as you go.
            </p>
            {view.questions.length === 0 ? (
              <p className={styles.cardLede}>Your notes leave nothing open that the first chapters need.</p>
            ) : (
              <ul className={styles.chipList}>
                {view.questions.map(item => (
                  <li key={item.id}>
                    <Checkbox
                      label={item.question}
                      description={item.why}
                      checked={draft.questions[item.id] === true}
                      disabled={busy}
                      onCheckedChange={checked => toggle('questions', item.id, checked === true)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SteerBox
            nudges={step.nudges}
            draft={steer}
            onDraftChange={setSteer}
            messages={roundThread(round)}
            onSubmit={() => run(true)}
            submitLabel="Organise again"
            running={busy}
            placeholder="e.g. keep the cast on one page…"
          />

          <LockBar
            label={meta.lockLabel ?? 'Add to my Story Bible'}
            hint={!read ? 'Reading back what you already added…' : (issue ?? organiseLockSummary(counts, removals))}
            onLock={lock}
            loading={lockStep.isPending}
            disabled={!read || selection == null || busy || lockStep.isPending}
          />
        </>
      )}
    </>
  );
}

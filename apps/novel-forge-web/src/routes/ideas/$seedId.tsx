import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Button, Dialog, FormField, IconButton, Input, Textarea, toast } from '@shadow-library/ui';

import { AppShell } from '@/components/Layout';
import { ChevronLeftIcon, ChevronRightIcon, ProposalsIcon, SendIcon, SparkIcon } from '@/components/icons';
import { type ChipIntent, FieldCard, Markdown, PaneError, PaneLoader, SidePanel, StatusChip, TurnStatus } from '@/components/nf';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ConceptCardResponse,
  isApiError,
  isTurnFailureRecorded,
  type ReadinessEntryResponse,
  seedQueryOptions,
  type SeedResponse,
  type StudioCardsPayloadResponse,
  type StudioQuestionResponse,
  type StudioQuestionsPayloadResponse,
  turnState,
  useChatMessagesQuery,
  useChatSessionQuery,
  useChatTurnMutation,
  useGraduateSeedMutation,
  useListChangesQuery,
  useProjectEventStream,
  useRevertProposalMutation,
  useSeedQuery,
  useSeedSync,
  useStressSeedMutation,
} from '@/lib/apis';
import { messageTime } from '@/lib/format';
import { firstTitle } from '@/lib/idea-title';
import { requireSession } from '@/lib/session';
import {
  fieldValue,
  missingSummary,
  provenanceText,
  readinessHeadline,
  readinessIntent,
  settledSummary,
  SHEET_FIELDS,
  type SheetFieldKey,
  sheetReadiness,
  SOURCE_INTENT,
} from '@/lib/seed-sheet';
import {
  answeredCount,
  answerText,
  composeAnswers,
  decideAnswer,
  holdsOption,
  nextUnanswered,
  recoverAnswers,
  shouldAdvanceAfter,
  type StudioAnswer,
  type StudioAnswers,
  toggleOption,
} from '@/lib/studio-answers';

import styles from './$seedId.module.css';

// The seed id IS the project id: a seed is a project in `seed` status. Seeds deliberately live outside the
// `/novels/$novelId` shell — that shell assumes chapters, runs and publishing, none of which a seed has.
export const Route = createFileRoute('/ideas/$seedId')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(seedQueryOptions(params.seedId));
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${firstTitle([loaderData?.name, loaderData?.fields.workingTitle], 'Idea')} · Ideation Studio` }] }),
  component: () => (
    <AppShell>
      <StudioScreen />
    </AppShell>
  ),
});

const VERDICT_INTENT: Record<ReadinessEntryResponse['verdict'], ChipIntent> = { strong: 'success', thin: 'warning', empty: 'danger' };

type Fate = 'kept' | 'killed' | 'crossed';

const FATE_LABEL: Record<Fate, string> = { kept: 'Keep', killed: 'Kill', crossed: 'Cross' };
const FATE_SENTENCE: Record<Fate, string> = { kept: 'Keeping', killed: 'Killing', crossed: 'Crossing' };

/** Graduation names its handoff documents as `section/slug`; the author is told what they are called. */
function documentLabel(ref: string): string {
  const words = (ref.split('/').pop() ?? ref).replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface ProvenanceSplit {
  filled: number;
  empty: number;
  author: number;
  studio: number;
  crossed: number;
  unattributed: number;
}

/**
 * The honesty check, computed here rather than read off the graduation response: the author has to see the
 * split BEFORE deciding, and graduation deletes the provenance with the rest of the seed. Only filled
 * fields carry a source, so the split counts them and reports the empty ones separately —
 * `author + crossed + studio + unattributed === filled`, and `filled + empty === SHEET_FIELDS.length`.
 */
function provenanceSplit(seed: SeedResponse): ProvenanceSplit {
  const split: ProvenanceSplit = { filled: 0, empty: 0, author: 0, studio: 0, crossed: 0, unattributed: 0 };
  for (const { key } of SHEET_FIELDS) {
    if (fieldValue(seed.fields, key) === undefined) {
      split.empty += 1;
      continue;
    }
    split.filled += 1;
    const source = seed.provenance[key]?.source;
    if (source) split[source] += 1;
    else split.unattributed += 1;
  }
  return split;
}

const NO_ANSWERS: StudioAnswers = {};

interface StagedAnswers {
  messageId: string;
  answers: StudioAnswers;
}

interface ClearedComposer {
  draft: string;
  staged: StagedAnswers;
}

type Direction = 'forward' | 'backward';

interface QuestionView {
  index: number;
  direction?: Direction;
}

// Long enough to see the tick land before the card moves on, short enough that a round of picks never feels held up.
const AUTO_ADVANCE_MS = 320;

interface PendingAdvance {
  from: number;
  to: number;
}

/**
 * `open` is the round being answered now. A closed round is `recorded` when its reply could be read back into answers,
 * so an unanswered question there was skipped, and `unrecorded` when the author replied in their own words.
 */
type RoundStatus = 'open' | 'recorded' | 'unrecorded';

interface Round {
  status: RoundStatus;
  answers: StudioAnswers;
}

interface QuestionCardProps {
  questions: StudioQuestionResponse[];
  answers: StudioAnswers;
  status: RoundStatus;
  onAnswer: (questionId: string, answer: StudioAnswer | undefined) => void;
  onRoundAnswered?: () => void;
  locked: boolean;
}

function isTextEntry(target: EventTarget): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function QuestionCard({ questions, answers, status, onAnswer, onRoundAnswered, locked }: QuestionCardProps): React.JSX.Element | null {
  const [view, setView] = useState<QuestionView>({ index: 0 });
  const [ownOpen, setOwnOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [focusOwn, setFocusOwn] = useState<string | null>(null);
  const [advance, setAdvance] = useState<PendingAdvance | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ownHintId = useId();
  const wordingId = useId();
  const decideHintId = useId();

  const index = Math.min(view.index, questions.length - 1);

  // Focus on a remounting body or a chevron about to be disabled would fall back to the document and strand the arrow keys.
  const strandsFocus = (active: Element | null, target: number): boolean => {
    if (!(active instanceof HTMLElement)) return false;
    if (bodyRef.current?.contains(active)) return true;
    return (active.dataset.nav === 'previous' && target === 0) || (active.dataset.nav === 'next' && target === questions.length - 1);
  };

  const go = (target: number): void => {
    setAdvance(null);
    if (target < 0 || target >= questions.length || target === index) return;
    if (strandsFocus(document.activeElement, target)) cardRef.current?.querySelector<HTMLButtonElement>(`[data-pip="${target}"]`)?.focus();
    setView({ index: target, direction: target > index ? 'forward' : 'backward' });
    setFocusOwn(null);
  };

  const advanceTo = useEffectEvent((target: number) => go(target));
  useEffect(() => {
    if (!advance) return;
    const timer = setTimeout(() => advanceTo(advance.to), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [advance]);

  const question = questions[index];
  if (!question) return null;
  const answer = answers[question.id];
  const answered = answerText(question, answer) !== undefined;
  const isLast = index === questions.length - 1;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTextEntry(event.target)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(event.key === 'ArrowRight' ? index + 1 : index - 1);
  };

  const revealOwn = (): void => {
    setOwnOpen(current => new Set(current).add(question.id));
    setFocusOwn(question.id);
  };

  const typeOwn = (text: string): void => {
    setAdvance(null);
    if (text) onAnswer(question.id, { kind: 'own', text });
    else if (answer?.kind === 'own') onAnswer(question.id, undefined);
  };

  const isMulti = question.select === 'many';
  const isDecideSelected = answer?.kind === 'decide';

  const radioCount = question.options.length + 1;
  const selectedRadioIndex = isMulti ? -1 : isDecideSelected ? question.options.length : answer?.kind === 'option' ? answer.index : -1;
  const activeRadioIndex = selectedRadioIndex === -1 ? 0 : selectedRadioIndex;

  const advanceAfter = (next: StudioAnswer | undefined): void => {
    if (!next) return;
    const after = { ...answers, [question.id]: next };
    if (!shouldAdvanceAfter(question, next)) {
      if (answeredCount(questions, after) === questions.length) onRoundAnswered?.();
      return;
    }
    const target = nextUnanswered(questions, after, index);
    if (target !== undefined) setAdvance({ from: index, to: target });
    else if (answeredCount(questions, after) === questions.length) onRoundAnswered?.();
  };

  const selectOption = (optionIndex: number): void => {
    const next = toggleOption(question, answer, optionIndex);
    onAnswer(question.id, next);
    setAdvance(null);
    advanceAfter(next);
  };

  const selectDecide = (): void => {
    const next = decideAnswer(answer);
    onAnswer(question.id, next);
    setAdvance(null);
    advanceAfter(next);
  };

  const onOptionsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isMulti || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const nextIndex = (activeRadioIndex + (event.key === 'ArrowDown' ? 1 : -1) + radioCount) % radioCount;
    if (nextIndex === question.options.length) selectDecide();
    else selectOption(nextIndex);
    radioRefs.current[nextIndex]?.focus();
  };

  const badge: { intent: ChipIntent; label: string } | undefined =
    status === 'open'
      ? { intent: answered ? 'success' : 'neutral', label: answered ? 'answered' : 'not answered' }
      : status === 'recorded'
        ? { intent: answered ? 'success' : 'warning', label: answered ? 'answered' : 'skipped' }
        : undefined;

  return (
    <div ref={cardRef} className={styles.questionCard} role="presentation" onKeyDown={onKeyDown}>
      <div className={styles.questionHead}>
        <span className={styles.questionStep}>
          Question {index + 1} of {questions.length}
        </span>
        {questions.length > 1 && (
          <>
            <span className={styles.pips}>
              {questions.map((candidate, candidateIndex) => {
                const candidateAnswered = answerText(candidate, answers[candidate.id]) !== undefined;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={styles.pip}
                    data-pip={candidateIndex}
                    data-answered={candidateAnswered}
                    aria-current={candidateIndex === index ? 'step' : undefined}
                    aria-label={`Question ${candidateIndex + 1}${candidateAnswered ? ', answered' : ''}`}
                    onClick={() => go(candidateIndex)}
                  />
                );
              })}
            </span>
            <span className={styles.questionNav}>
              <IconButton
                size="sm"
                variant="secondary"
                data-nav="previous"
                aria-label="Previous question"
                icon={<ChevronLeftIcon />}
                disabled={index === 0}
                onClick={() => go(index - 1)}
              />
              <IconButton
                size="sm"
                variant={answered && !isLast ? 'primary' : 'secondary'}
                data-nav="next"
                aria-label="Next question"
                icon={<ChevronRightIcon />}
                disabled={isLast}
                onClick={() => go(index + 1)}
              />
            </span>
          </>
        )}
      </div>

      <div key={index} ref={bodyRef} className={styles.questionBody} data-direction={view.direction}>
        {advance?.from === index && <span className={styles.advanceBar} aria-hidden="true" />}
        {badge && <StatusChip intent={badge.intent}>{badge.label}</StatusChip>}
        <div id={wordingId} className={styles.questionWording}>
          {question.wording}
        </div>
        <div className={styles.questionCoaching}>{question.coaching}</div>
        <div className={styles.options} role={isMulti ? 'group' : 'radiogroup'} aria-labelledby={wordingId} onKeyDown={onOptionsKeyDown}>
          {question.options.map((option, optionIndex) => {
            const selected = holdsOption(answer, optionIndex);
            return (
              <button
                key={optionIndex}
                type="button"
                ref={el => {
                  radioRefs.current[optionIndex] = el;
                }}
                className={styles.option}
                role={isMulti ? 'checkbox' : 'radio'}
                aria-checked={selected}
                aria-describedby={isMulti ? decideHintId : undefined}
                tabIndex={isMulti ? undefined : optionIndex === activeRadioIndex ? 0 : -1}
                disabled={locked}
                onClick={() => selectOption(optionIndex)}
              >
                <span className={`${styles.optionTick} ${isMulti ? styles.checkboxTick : ''}`} aria-hidden="true" />
                <span>{option}</span>
              </button>
            );
          })}
          <button
            type="button"
            ref={el => {
              radioRefs.current[question.options.length] = el;
            }}
            className={`${styles.option} ${styles.optionDecide}`}
            role={isMulti ? 'checkbox' : 'radio'}
            aria-checked={isDecideSelected}
            aria-describedby={isMulti ? decideHintId : undefined}
            tabIndex={isMulti ? undefined : question.options.length === activeRadioIndex ? 0 : -1}
            disabled={locked}
            onClick={selectDecide}
          >
            <span className={styles.optionTick} aria-hidden="true" />
            <span className={styles.decideBody}>
              <span className={styles.decideLabel}>You decide</span>
              <span className={styles.decideText}>{question.youDecide}</span>
            </span>
          </button>
          {isMulti && (
            <span id={decideHintId} className={styles.hint}>
              Picking an option clears &quot;You decide&quot;; picking &quot;You decide&quot; clears your picks.
            </span>
          )}
        </div>
        {status !== 'open' ? (
          answer?.kind === 'own' && <p className={styles.ownQuote}>{answer.text}</p>
        ) : ownOpen.has(question.id) || answer?.kind === 'own' ? (
          <div className={styles.ownAnswer}>
            <Textarea
              size="sm"
              aria-label="Your own answer"
              aria-describedby={ownHintId}
              placeholder="Your answer to this question"
              value={answer?.kind === 'own' ? answer.text : ''}
              onValueChange={typeOwn}
              disabled={locked}
              autoFocus={focusOwn === question.id}
              autoGrow
              minRows={1}
              maxRows={8}
            />
            <span id={ownHintId} className={styles.ownHint}>
              Typing here replaces the option you picked.
            </span>
          </div>
        ) : (
          <Button size="sm" variant="text" className={styles.ownToggle} disabled={locked} onClick={revealOwn}>
            Write my own answer
          </Button>
        )}
      </div>
    </div>
  );
}

interface QuestionsBlockProps extends Omit<QuestionCardProps, 'questions'> {
  payload: StudioQuestionsPayloadResponse;
}

function QuestionsBlock({ payload, ...card }: QuestionsBlockProps): React.JSX.Element {
  return (
    <div className={styles.payload}>
      {payload.locks && payload.locks.length > 0 && (
        <div className={styles.locks}>
          <div className={styles.blockLabel}>Locked from what you said — say so if any of these is wrong</div>
          {payload.locks.map(lock => (
            <div key={lock.key} className={styles.lockRow}>
              <StatusChip intent="neutral">{lock.kind}</StatusChip>
              <span className={styles.lockText}>{lock.text}</span>
            </div>
          ))}
        </div>
      )}
      <QuestionCard questions={payload.questions} {...card} />
    </div>
  );
}

interface ComposeProps {
  onCompose: (content: string) => void;
  disabled: boolean;
}

interface CardVerdict {
  fate: Fate;
  reason: string;
}

/**
 * The chat-message payload is a frozen snapshot — its card always carries `fate: 'offered'`. The seed's
 * `concepts` list is the live record, so the real verdict (if any) is read off the matching entry there.
 */
function recordedVerdict(matched: ConceptCardResponse | undefined): CardVerdict | undefined {
  return matched && matched.fate !== 'offered' ? { fate: matched.fate, reason: matched.reason ?? '' } : undefined;
}

/**
 * Cards are matched to the live sheet by their server-minted id. Transcripts written before ids existed
 * carry none, so those fall back to round + position within the round — the old behaviour, which is wrong
 * the moment the model reorders a re-sent collection and is why the id exists.
 */
function matchCards(payload: StudioCardsPayloadResponse, seed: SeedResponse): (ConceptCardResponse | undefined)[] {
  const byId = new Map(seed.concepts.map(concept => [concept.id, concept]));
  const byRound = new Map<number, ConceptCardResponse[]>();
  for (const concept of seed.concepts) byRound.set(concept.round, [...(byRound.get(concept.round) ?? []), concept]);

  const roundSeen = new Map<number, number>();
  return payload.cards.map(card => {
    const round = card.round || payload.round;
    const index = roundSeen.get(round) ?? 0;
    roundSeen.set(round, index + 1);
    return byId.get(card.id) ?? (card.id ? undefined : byRound.get(round)?.[index]);
  });
}

function ConceptCardsBlock({ payload, seed, onCompose, disabled }: { payload: StudioCardsPayloadResponse; seed: SeedResponse } & ComposeProps): React.JSX.Element {
  const [verdicts, setVerdicts] = useState<Record<string, CardVerdict>>({});

  // Pre-id transcripts have no identity to key on, so those still fall back to round + position.
  const cardKey = (card: ConceptCardResponse, index: number): string => card.id || `${card.round || payload.round}:${index}`;
  const setFate = (key: string, fate: Fate): void => setVerdicts(prev => ({ ...prev, [key]: { fate, reason: prev[key]?.reason ?? '' } }));
  const setReason = (key: string, reason: string): void => setVerdicts(prev => ({ ...prev, [key]: { fate: prev[key]?.fate ?? 'kept', reason } }));

  const matched = matchCards(payload, seed);

  const undecided = payload.cards.map((card, index) => ({ card, key: cardKey(card, index), recorded: recordedVerdict(matched[index]) })).filter(({ recorded }) => !recorded);
  const decided = undecided.filter(({ key }) => verdicts[key]);
  const compose = (): void => {
    const lines = decided.map(({ card, key }) => {
      const verdict = verdicts[key] as CardVerdict;
      const reason = verdict.reason.trim();
      return `${FATE_SENTENCE[verdict.fate]} “${card.title}”${reason ? ` — ${reason}` : ''}.`;
    });
    onCompose(lines.join(' '));
  };

  return (
    <div className={styles.payload}>
      {payload.filtersFailed && payload.filtersFailed.length > 0 && (
        <div className={styles.filterNote}>
          Some of these break a shape you locked, and the studio is showing them anyway — your judgement outranks the filter.
          {payload.filtersFailed.map(rejection => (
            <div key={`${rejection.playbookKey}-${rejection.card}`} className={styles.filterRow}>
              “{rejection.card}” vs {rejection.playbookKey} — {rejection.mustReplace}
            </div>
          ))}
        </div>
      )}
      <div className={styles.cards}>
        {payload.cards.map((card, index) => {
          const key = cardKey(card, index);
          const recorded = recordedVerdict(matched[index]);
          const verdict = recorded ?? verdicts[key];
          return (
            <div key={key} className={styles.card} data-fate={verdict?.fate}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>{card.title}</span>
                <StatusChip intent="neutral">round {card.round || payload.round}</StatusChip>
              </div>
              <p className={styles.cardLogline}>{card.logline}</p>
              {card.hookLine && <p className={styles.cardHook}>{card.hookLine}</p>}
              <dl className={styles.cardFacets}>
                <div>
                  <dt>Engine</dt>
                  <dd>{card.engine}</dd>
                </div>
                <div>
                  <dt>Ladder</dt>
                  <dd>{card.ladder}</dd>
                </div>
                <div>
                  <dt>Posture</dt>
                  <dd>{card.posture}</dd>
                </div>
              </dl>
              <div className={styles.cardActions}>
                {(['kept', 'killed', 'crossed'] as const).map(fate => (
                  <button
                    key={fate}
                    type="button"
                    className={styles.chip}
                    aria-pressed={verdict?.fate === fate}
                    data-active={verdict?.fate === fate}
                    disabled={disabled || Boolean(recorded)}
                    onClick={() => setFate(key, fate)}
                  >
                    {FATE_LABEL[fate]}
                  </button>
                ))}
              </div>
              {recorded
                ? recorded.reason.trim() !== '' && <p className={styles.cardLogline}>“{recorded.reason}”</p>
                : verdicts[key] && (
                    <Input
                      size="sm"
                      placeholder="Why? (optional — the studio uses the reason on the next round)"
                      value={verdicts[key]?.reason ?? ''}
                      onValueChange={value => setReason(key, value)}
                    />
                  )}
            </div>
          );
        })}
      </div>
      <Button size="sm" variant="secondary" disabled={disabled || decided.length === 0} onClick={compose}>
        Put {decided.length || 'my'} verdict{decided.length === 1 ? '' : 's'} in the reply
      </Button>
    </div>
  );
}

function ReadinessTable({ readiness }: { readiness: ReadinessEntryResponse[] }): React.JSX.Element {
  return (
    <div className={styles.payload}>
      <table className={styles.readiness}>
        <caption className={styles.readinessCaption}>Readiness by dimension — the verdict, and what would lift it</caption>
        <tbody>
          {readiness.map(entry => (
            <tr key={entry.dimension}>
              <th scope="row">{entry.dimension}</th>
              <td>
                <StatusChip intent={VERDICT_INTENT[entry.verdict]}>{entry.verdict}</StatusChip>
              </td>
              <td>
                <div>{entry.note}</div>
                {entry.fix && <div className={styles.readinessFix}>{entry.fix}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface GraduateDialogProps {
  seed: SeedResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function GraduateDialog({ seed, open, onOpenChange }: GraduateDialogProps): React.JSX.Element {
  const navigate = useNavigate();
  const graduate = useGraduateSeedMutation(seed.projectId);
  const [title, setTitle] = useState(seed.fields.workingTitle ?? '');

  const split = provenanceSplit(seed);
  const advisories = seed.readiness.filter(entry => entry.verdict !== 'strong');
  const hasPremise = Boolean(fieldValue(seed.fields, 'premise'));

  const submit = (): void => {
    if (!title.trim()) return;
    graduate.mutate(
      { title: title.trim() },
      {
        onSuccess: result => {
          onOpenChange(false);
          toast.success(
            `“${result.project.title ?? result.project.name}” is a novel — ${result.documents.map(documentLabel).join(' and ')} written, ${result.factKeys.length} promise fact(s) kept.`,
          );
          void navigate({ to: '/novels/$novelId/overview', params: { novelId: result.project.id } });
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Start the novel" description="The sheet folds into the Story Bible, the studio conversation closes, and the idea becomes a project." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <FormField label="Title" required helper="The project is named after this; you can rename it later.">
              <Input placeholder="e.g. The Wreck Singer" value={title} onValueChange={setTitle} autoFocus />
            </FormField>

            <div className={styles.honesty}>
              <div className={styles.blockLabel}>Where this sheet came from</div>
              <p className={styles.honestyLine}>
                Of the {split.filled} field{split.filled === 1 ? '' : 's'} that {split.filled === 1 ? 'is' : 'are'} filled, {split.author} {split.author === 1 ? 'is' : 'are'} your
                own words{split.crossed > 0 ? `, ${split.crossed} came from crossing concepts` : ''}, and {split.studio + split.unattributed} came from the studio.
                {split.empty > 0 ? ` ${split.empty} field${split.empty === 1 ? ' is' : 's are'} still empty.` : ''}
              </p>
              {split.studio + split.unattributed > split.author && (
                <p className={styles.honestyWarn}>Most of this sheet is the studio talking — ten more minutes of answering would make it yours.</p>
              )}
            </div>

            {advisories.length > 0 && (
              <div className={styles.advisories}>
                <div className={styles.blockLabel}>The stress check flagged these — advice, not a gate</div>
                {advisories.map(entry => (
                  <div key={entry.dimension} className={styles.advisoryRow}>
                    <StatusChip intent={VERDICT_INTENT[entry.verdict]}>{entry.verdict}</StatusChip>
                    <span>
                      <strong>{entry.dimension}</strong> — {entry.fix ?? entry.note}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!hasPremise && <p className={styles.honestyWarn}>The studio needs a premise before it can start the novel — answer one more question first.</p>}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Keep working on it</Button>
          </Dialog.Close>
          <Button variant="primary" loading={graduate.isPending} disabled={!title.trim() || !hasPremise} onClick={submit}>
            Start the novel
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function SeedPanel({ seed, onGraduate }: { seed: SeedResponse; onGraduate: () => void }): React.JSX.Element {
  const stress = useStressSeedMutation(seed.projectId);
  const changesQuery = useListChangesQuery(seed.projectId);
  const revert = useRevertProposalMutation(seed.projectId);

  const sheetChanges = (changesQuery.data?.items ?? []).filter(change => change.scopeType === 'ideation' && change.revertible);
  const readinessBy = new Map(seed.readiness.map(entry => [entry.dimension, entry]));
  const readiness = sheetReadiness(seed.fields);
  const stillToSettle = missingSummary(readiness.missing);

  const runStress = (): void =>
    stress.mutate(undefined, {
      onSuccess: result => {
        const weak = result.readiness.filter(entry => entry.verdict !== 'strong').length;
        toast.success(weak === 0 ? 'Every dimension came back strong.' : `${weak} dimension(s) need work — the sheet shows what would lift them.`);
      },
      onError: err => toast.danger(err.message),
    });

  const doRevert = (proposalId: string): void =>
    revert.mutate(proposalId, {
      onSuccess: () => toast.success('Taken back off the sheet.'),
      onError: err =>
        toast.danger(
          err.code === 'RFN_006' || err.code === 'RFN_003'
            ? 'The sheet has moved on since that change — the studio can no longer take it back. Say what you want instead and the studio will change it forward.'
            : err.message,
        ),
    });

  const fieldProvenance = (key: SheetFieldKey): React.JSX.Element | undefined => {
    const provenance = seed.provenance[key];
    if (!provenance) return undefined;
    return <StatusChip intent={SOURCE_INTENT[provenance.source]}>{provenanceText(provenance)}</StatusChip>;
  };

  return (
    <SidePanel
      title="Story seed"
      titleAccessory={
        <StatusChip intent={readinessIntent(readiness)}>
          {readiness.settled}/{readiness.total}
        </StatusChip>
      }
      summary={settledSummary(readiness)}
      footer={
        <Button size="sm" variant="primary" className={styles.graduate} onClick={onGraduate}>
          Start the novel
        </Button>
      }
    >
      <section className={styles.section}>
        <div className={styles.readinessHead}>
          <SparkIcon size={14} />
          <span className={styles.readinessHeadline}>{readinessHeadline(readiness)}</span>
        </div>
        <span className={styles.meter} aria-hidden="true">
          <span className={styles.meterFill} style={{ inlineSize: `${Math.round((readiness.settled / readiness.total) * 100)}%` }} />
        </span>
        {stillToSettle && <p className={styles.hint}>{stillToSettle}</p>}
      </section>

      <section className={styles.fields}>
        {SHEET_FIELDS.map(({ key, label }) => (
          <FieldCard key={key} label={label} value={fieldValue(seed.fields, key)} provenance={fieldProvenance(key)} />
        ))}
      </section>

      {seed.constraints.length > 0 && (
        <section className={styles.section}>
          <div className={styles.blockLabel}>Locked constraints</div>
          {seed.constraints.map(constraint => (
            <div key={constraint.key} className={styles.lockRow}>
              <StatusChip intent={constraint.lockedBy === 'author' ? 'success' : 'neutral'}>{constraint.kind}</StatusChip>
              <span className={styles.lockText}>{constraint.text}</span>
            </div>
          ))}
        </section>
      )}

      {(seed.tasteAnchors.comps.length > 0 || seed.tasteAnchors.preferences.length > 0) && (
        <section className={styles.section}>
          <div className={styles.blockLabel}>Taste anchors</div>
          {seed.tasteAnchors.comps.length > 0 && <div className={styles.anchorRow}>{seed.tasteAnchors.comps.join(' · ')}</div>}
          {seed.tasteAnchors.preferences.map(preference => (
            <div key={preference} className={styles.anchorRow}>
              {preference}
            </div>
          ))}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div className={styles.blockLabel}>Stress check</div>
          <Button size="sm" variant="ghost" loading={stress.isPending} onClick={runStress}>
            Run stress check
          </Button>
        </div>
        {seed.readiness.length === 0 ? (
          <p className={styles.hint}>Nothing stressed yet — the check names what a planner could and couldn’t build on.</p>
        ) : (
          [...readinessBy.values()].map(entry => (
            <div key={entry.dimension} className={styles.readinessRow}>
              <StatusChip intent={VERDICT_INTENT[entry.verdict]}>{entry.verdict}</StatusChip>
              <span className={styles.readinessDim}>{entry.dimension}</span>
              <span className={styles.readinessNote}>{entry.fix ?? entry.note}</span>
            </div>
          ))
        )}
      </section>

      {sheetChanges.length > 0 && (
        <section className={styles.section}>
          <div className={styles.blockLabel}>Recent sheet changes</div>
          <p className={styles.hint}>A change the sheet has since moved past can no longer be taken back — say what you want instead.</p>
          {sheetChanges.slice(0, 8).map(change => (
            <div key={change.id} className={styles.changeRow}>
              <span className={styles.changeSummary}>{change.summary?.trim() || change.refs.join(', ') || 'sheet update'}</span>
              <Button size="sm" variant="ghost" loading={revert.isPending} onClick={() => doRevert(change.id)}>
                Undo
              </Button>
            </div>
          ))}
        </section>
      )}
    </SidePanel>
  );
}

function StudioScreen(): React.JSX.Element {
  const { seedId } = Route.useParams();
  const seedQuery = useSeedQuery(seedId);
  const seed = seedQuery.data;
  const sessionId = seed?.sessionId ?? '';
  useProjectEventStream(seedId);
  const messagesQuery = useChatMessagesQuery(seedId, sessionId || undefined, Boolean(sessionId));
  const queryClient = useQueryClient();
  const sessionQuery = useChatSessionQuery(seedId, sessionId, Boolean(sessionId));
  const turn = useChatTurnMutation(seedId, sessionId);
  const syncSeed = useSeedSync(seedId);
  const [input, setInput] = useState('');
  const [staged, setStaged] = useState<StagedAnswers>({ messageId: '', answers: NO_ANSWERS });
  const [graduateOpen, setGraduateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);

  const changesQuery = useListChangesQuery(seedId);

  const messages = messagesQuery.data?.messages ?? [];
  // Whatever the transcript held when it first loaded is history; a reply outside this set landed while the author watched.
  const [historyIds, setHistoryIds] = useState<ReadonlySet<string> | null>(null);
  if (historyIds === null && messagesQuery.data) setHistoryIds(new Set(messagesQuery.data.messages.map(message => message.id)));
  const state = turnState(messagesQuery.data);
  // The composer locks on this tab's own request OR a turn the server still has running — the latter is
  // what stops a second tab or a refresh from racing a reply that is already on its way.
  const pending = turn.isPending || state.kind === 'pending';
  // The change feed carries applied and reverted proposals only, so it is what tells a turn that moved the
  // sheet apart from one whose proposal is still sitting there pending.
  const appliedChanges = new Map((changesQuery.data?.items ?? []).filter(change => change.status === 'applied').map(change => [change.id, change]));

  const lastAssistant = messages.filter(message => message.role === 'assistant').at(-1);
  // A reply after the round closes it, even one whose turn failed: the retry re-sends that reply as written.
  const repliedTo = new Map<string, string>();
  messages.forEach((message, position) => {
    if (message.role !== 'assistant' || message.payload?.kind !== 'questions') return;
    const reply = messages.slice(position + 1).find(candidate => candidate.role === 'user');
    if (reply) repliedTo.set(message.id, reply.content);
  });
  const openRound =
    lastAssistant?.payload?.kind === 'questions' && !repliedTo.has(lastAssistant.id) ? { messageId: lastAssistant.id, questions: lastAssistant.payload.questions } : undefined;
  const openAnswers = openRound && staged.messageId === openRound.messageId ? staged.answers : NO_ANSWERS;
  const answered = openRound ? answeredCount(openRound.questions, openAnswers) : 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pending]);

  const stageAnswer = (messageId: string, questionId: string, next: StudioAnswer | undefined): void =>
    setStaged(current => ({ messageId, answers: { ...(current.messageId === messageId ? current.answers : NO_ANSWERS), [questionId]: next } }));

  // A retry sends its own text and leaves the composer alone; only the composer's own send clears the draft and the
  // staged answers, and a failure puts each back unless the author has started on something else in the meantime.
  const send = (content: string, cleared?: ClearedComposer): void => {
    const text = content.trim();
    if (!text || pending || !sessionId) return;
    if (cleared) {
      setInput('');
      setStaged({ messageId: '', answers: NO_ANSWERS });
    }
    turn.mutate(
      { content: text },
      {
        onSuccess: result => {
          syncSeed(result.seed);
          if (result.applyNote) toast.warning(result.applyNote);
        },
        // A failure the turn recorded shows as its own card, message kept and a retry offered; only one that never
        // reached the transcript needs the toast and the draft handed back.
        onError: async (err, _content, context) => {
          if (await isTurnFailureRecorded(queryClient, seedId, sessionId, context?.previous)) return;
          toast.danger(err.message);
          if (!cleared) return;
          setInput(current => current || cleared.draft);
          setStaged(current => (current.messageId ? current : cleared.staged));
        },
      },
    );
  };

  const sendComposer = (): void => send(openRound && answered > 0 ? composeAnswers(openRound.questions, openAnswers, input) : input, { draft: input, staged });

  const compose = (content: string): void => setInput(current => (current.trim() ? `${current.trim()} ${content}` : content));

  const roundOf = (messageId: string, questions: StudioQuestionResponse[]): Round => {
    if (messageId === openRound?.messageId) return { status: 'open', answers: openAnswers };
    const reply = repliedTo.get(messageId);
    const recovered = reply === undefined ? undefined : recoverAnswers(questions, reply);
    return recovered ? { status: 'recorded', answers: recovered } : { status: 'unrecorded', answers: NO_ANSWERS };
  };

  if (seedQuery.isLoading) return <PaneLoader />;
  if (seedQuery.error) return <PaneError error={seedQuery.error} />;
  if (!seed) return <PaneLoader />;

  return (
    <div className={styles.screen}>
      <div className={styles.thread}>
        <div ref={scrollRef} className={`nf-scroll ${styles.scroll}`}>
          <div className={styles.msgList}>
            {messagesQuery.isLoading && <PaneLoader />}
            {messagesQuery.error && <PaneError error={messagesQuery.error} />}
            {!messagesQuery.isLoading && messages.length === 0 && (
              <p className={styles.emptyHint}>Tell the studio what you have — a sentence, a mood, or a book you want yours to sit beside.</p>
            )}
            {messages.map(message => {
              if (message.role === 'user')
                return (
                  <div key={message.id} className={styles.userRow}>
                    <div className={styles.userCol}>
                      <div className={styles.userBubble}>{message.content}</div>
                      <time className={styles.userTime} dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                        {messageTime(message.createdAt)}
                      </time>
                    </div>
                  </div>
                );

              const payload = message.payload;
              const applied = message.proposalId ? appliedChanges.get(message.proposalId) : undefined;
              return (
                <div key={message.id} className={styles.assistantRow} data-arrived={historyIds && !historyIds.has(message.id) ? 'true' : undefined}>
                  <div className={styles.avatar}>
                    <SparkIcon size={15} />
                  </div>
                  <div className={styles.assistantCol}>
                    <Markdown content={message.content} className={styles.assistantBubble} />
                    <MessageModelTag message={message} />
                    {payload?.kind === 'questions' && (
                      <QuestionsBlock
                        payload={payload}
                        {...roundOf(message.id, payload.questions)}
                        onAnswer={(questionId, next) => stageAnswer(message.id, questionId, next)}
                        onRoundAnswered={() => sendRef.current?.focus()}
                        locked={message.id !== openRound?.messageId || pending || !sessionId}
                      />
                    )}
                    {payload?.kind === 'cards' && <ConceptCardsBlock payload={payload} seed={seed} onCompose={compose} disabled={pending} />}
                    {payload?.kind === 'readiness' && <ReadinessTable readiness={payload.readiness} />}
                    {applied && (
                      <div className={styles.appliedNote}>
                        <ProposalsIcon size={13} /> the sheet moved with this turn{applied.revertible ? ' — undo it from the sheet' : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <TurnStatus state={state} sending={turn.isPending} fallbackLabel="The studio is reading what you wrote" onRetry={send} />
          </div>
        </div>

        <div className={styles.composer}>
          <div className={styles.composerInner}>
            <Textarea
              value={input}
              onValueChange={setInput}
              aria-label="Your reply"
              placeholder={sessionId ? 'Answer in your own words, or pick an option above — everything is revertible from the sheet' : 'This idea has no studio conversation.'}
              minRows={1}
              maxRows={6}
              autoGrow
              disabled={pending || !sessionId}
              className={styles.input}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendComposer();
                }
              }}
            />
            <div className={styles.composerBar}>
              <ChatModelMenu novelId={seedId} session={sessionQuery.data} scopeType="ideation" disabled={pending || !sessionQuery.data} />
              <div className={styles.spacer} />
              {openRound && answered > 0 && (
                <span className={styles.progress}>
                  {answered} of {openRound.questions.length} answered
                  <span className={styles.progressDots} aria-hidden="true">
                    {openRound.questions.map(question => (
                      <span key={question.id} className={styles.progressDot} data-answered={answerText(question, openAnswers[question.id]) !== undefined} />
                    ))}
                  </span>
                </span>
              )}
              <Button ref={sendRef} variant="primary" size="sm" prefix={<SendIcon size={14} />} loading={pending} disabled={pending || !sessionId} onClick={sendComposer}>
                {answered > 0 ? `Send ${answered} answer${answered === 1 ? '' : 's'}` : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SeedPanel seed={seed} onGraduate={() => setGraduateOpen(true)} />
      {/* Mounted only while open so the title field starts from whatever the sheet says at that moment, and a
          turn landing behind the dialog never rewrites what the author is typing. */}
      {graduateOpen && <GraduateDialog seed={seed} open onOpenChange={setGraduateOpen} />}
    </div>
  );
}

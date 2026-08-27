import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, FormField, Input, Spinner, Textarea, toast } from '@shadow-library/ui';

import { AppShell } from '@/components/Layout';
import { ProposalsIcon, SendIcon, SparkIcon } from '@/components/icons';
import { type ChipIntent, Markdown, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import { MessageModelTag } from '@/components/nf/ChatModel';
import {
  type ChatMessageResponse,
  type ConceptCardResponse,
  type FieldProvenanceResponse,
  isApiError,
  type ReadinessEntryResponse,
  type SeedFieldsResponse,
  seedQueryOptions,
  type SeedResponse,
  useChatMessagesQuery,
  useChatTurnMutation,
  useGraduateSeedMutation,
  useListChangesQuery,
  useRevertProposalMutation,
  useSeedQuery,
  useSeedSync,
  useStressSeedMutation,
} from '@/lib/apis';
import { messageTime } from '@/lib/format';
import { requireSession } from '@/lib/session';

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
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.fields.workingTitle ?? 'Idea'} · Ideation Studio` }] }),
  component: () => (
    <AppShell>
      <StudioScreen />
    </AppShell>
  ),
});

interface StudioQuestion {
  id: string;
  wording: string;
  coaching: string;
  options: string[];
  youDecide: string;
}

interface StudioLock {
  key: string;
  kind: 'shape' | 'scope' | 'promise';
  text: string;
}

interface FilterRejection {
  playbookKey: string;
  card: string;
  mustReplace: string;
}

/**
 * The structured half of a studio reply. The generated `payload` type is an opaque object — the server
 * declares it as free-form jsonb — so the discriminator is read first and the narrowing done here, once.
 */
type StudioPayload =
  | { kind: 'questions'; questions: StudioQuestion[]; locks?: StudioLock[] }
  | { kind: 'cards'; round: number; cards: ConceptCardResponse[]; filtersFailed?: FilterRejection[] }
  | { kind: 'readiness'; readiness: ReadinessEntryResponse[] };

function studioPayload(payload: ChatMessageResponse['payload']): StudioPayload | undefined {
  const kind = (payload as { kind?: unknown } | null | undefined)?.kind;
  if (kind !== 'questions' && kind !== 'cards' && kind !== 'readiness') return undefined;
  return payload as unknown as StudioPayload;
}

type SheetField = keyof SeedFieldsResponse;

const SHEET_FIELDS: { key: SheetField; label: string }[] = [
  { key: 'workingTitle', label: 'Working title' },
  { key: 'genre', label: 'Genre' },
  { key: 'premise', label: 'Premise' },
  { key: 'hook', label: 'Hook' },
  { key: 'castShape', label: 'Cast shape' },
  { key: 'protagonistDrive', label: 'What they want' },
  { key: 'stakes', label: 'Stakes' },
  { key: 'progressionSystem', label: 'Progression' },
  { key: 'voice', label: 'Voice' },
  { key: 'themes', label: 'Themes' },
  { key: 'serializationNotes', label: 'Serialization' },
];

const SOURCE_INTENT: Record<FieldProvenanceResponse['source'], ChipIntent> = { author: 'success', studio: 'info', crossed: 'accent' };
const SOURCE_LABEL: Record<FieldProvenanceResponse['source'], string> = { author: 'yours', studio: 'studio', crossed: 'crossed' };
const VERDICT_INTENT: Record<ReadinessEntryResponse['verdict'], ChipIntent> = { strong: 'success', thin: 'warning', empty: 'danger' };

type Fate = 'kept' | 'killed' | 'crossed';

const FATE_LABEL: Record<Fate, string> = { kept: 'Keep', killed: 'Kill', crossed: 'Cross' };
const FATE_SENTENCE: Record<Fate, string> = { kept: 'Keeping', killed: 'Killing', crossed: 'Crossing' };

/** Graduation names its handoff documents as `section/slug`; the author is told what they are called. */
function documentLabel(ref: string): string {
  const words = (ref.split('/').pop() ?? ref).replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fieldValue(fields: SeedFieldsResponse, key: SheetField): string | undefined {
  const value = fields[key];
  if (Array.isArray(value)) return value.length > 0 ? value.join(' · ') : undefined;
  return value?.trim() || undefined;
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

interface SendProps {
  onSend: (content: string) => void;
  onCompose: (content: string) => void;
  disabled: boolean;
}

function QuestionsBlock({ payload, onSend, disabled }: { payload: Extract<StudioPayload, { kind: 'questions' }> } & Omit<SendProps, 'onCompose'>): React.JSX.Element {
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
      {payload.questions.map(question => (
        <div key={question.id} className={styles.question}>
          <div className={styles.questionWording}>{question.wording}</div>
          <div className={styles.questionCoaching}>{question.coaching}</div>
          <div className={styles.chips}>
            {question.options.map(option => (
              <button key={option} type="button" className={styles.chip} disabled={disabled} onClick={() => onSend(option)}>
                {option}
              </button>
            ))}
            <button type="button" className={`${styles.chip} ${styles.chipDecide}`} disabled={disabled} onClick={() => onSend(question.youDecide)}>
              <span className={styles.chipDecideLabel}>You decide</span>
              <span className={styles.chipDecideText}>{question.youDecide}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
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
function matchCards(payload: Extract<StudioPayload, { kind: 'cards' }>, seed: SeedResponse): (ConceptCardResponse | undefined)[] {
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

function ConceptCardsBlock({
  payload,
  seed,
  onCompose,
  disabled,
}: { payload: Extract<StudioPayload, { kind: 'cards' }>; seed: SeedResponse } & Omit<SendProps, 'onSend'>): React.JSX.Element {
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

function SheetPane({ seed, onGraduate }: { seed: SeedResponse; onGraduate: () => void }): React.JSX.Element {
  const stress = useStressSeedMutation(seed.projectId);
  const changesQuery = useListChangesQuery(seed.projectId);
  const revert = useRevertProposalMutation(seed.projectId);

  const sheetChanges = (changesQuery.data?.items ?? []).filter(change => change.scopeType === 'ideation' && change.revertible);
  const readinessBy = new Map(seed.readiness.map(entry => [entry.dimension, entry]));

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

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetHead}>
        <SparkIcon size={15} />
        <span className={styles.sheetTitle}>Story seed</span>
        <div className={styles.spacer} />
        <Button size="sm" variant="primary" onClick={onGraduate}>
          Start the novel
        </Button>
      </div>

      <div className={`nf-scroll ${styles.sheetBody}`}>
        <section className={styles.section}>
          {SHEET_FIELDS.map(({ key, label }) => {
            const value = fieldValue(seed.fields, key);
            const provenance = seed.provenance[key];
            return (
              <div key={key} className={styles.field} data-empty={value === undefined}>
                <div className={styles.fieldHead}>
                  <span className={styles.fieldLabel}>{label}</span>
                  {value !== undefined && provenance && (
                    <StatusChip intent={SOURCE_INTENT[provenance.source]}>
                      {SOURCE_LABEL[provenance.source]}
                      {provenance.turnOrdinal !== null ? ` · turn ${provenance.turnOrdinal}` : ''}
                    </StatusChip>
                  )}
                </div>
                <div className={styles.fieldValue}>{value ?? 'not settled yet'}</div>
              </div>
            );
          })}
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
            {seed.tasteAnchors.comps.length > 0 && <div className={styles.fieldValue}>{seed.tasteAnchors.comps.join(' · ')}</div>}
            {seed.tasteAnchors.preferences.map(preference => (
              <div key={preference} className={styles.anchorRow}>
                {preference}
              </div>
            ))}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.blockLabel}>Readiness</div>
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
      </div>
    </div>
  );
}

function StudioScreen(): React.JSX.Element {
  const { seedId } = Route.useParams();
  const seedQuery = useSeedQuery(seedId);
  const seed = seedQuery.data;
  const sessionId = seed?.sessionId ?? '';
  const messagesQuery = useChatMessagesQuery(seedId, sessionId || undefined, Boolean(sessionId));
  const turn = useChatTurnMutation(seedId, sessionId);
  const syncSeed = useSeedSync(seedId);
  const [input, setInput] = useState('');
  const [graduateOpen, setGraduateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const changesQuery = useListChangesQuery(seedId);

  const messages = messagesQuery.data?.messages ?? [];
  const pending = turn.isPending || (messagesQuery.data?.pendingTurn ?? false);
  // The change feed carries applied and reverted proposals only, so it is what tells a turn that moved the
  // sheet apart from one whose proposal is still sitting there pending.
  const appliedChanges = new Map((changesQuery.data?.items ?? []).filter(change => change.status === 'applied').map(change => [change.id, change]));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, pending]);

  // A chip sends its own text and leaves the composer alone; only the composer's own send clears the draft,
  // and a failure puts it back unless the author has started typing something else in the meantime.
  const send = (content: string, clearedDraft?: string): void => {
    const text = content.trim();
    if (!text || pending || !sessionId) return;
    if (clearedDraft !== undefined) setInput('');
    turn.mutate(text, {
      onSuccess: result => {
        syncSeed(result.seed);
        if (result.applyNote) toast.warning(result.applyNote);
      },
      onError: err => {
        toast.danger(err.message);
        if (clearedDraft !== undefined) setInput(current => current || clearedDraft);
      },
    });
  };

  const sendDraft = (): void => send(input, input);

  const compose = (content: string): void => setInput(current => (current.trim() ? `${current.trim()} ${content}` : content));

  if (seedQuery.isLoading) return <PaneLoader />;
  if (seedQuery.error) return <PaneError error={seedQuery.error} />;
  if (!seed) return <PaneLoader />;

  return (
    <div className="nf-splitpane">
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

              const payload = studioPayload(message.payload);
              const applied = message.proposalId ? appliedChanges.get(message.proposalId) : undefined;
              return (
                <div key={message.id} className={styles.assistantRow}>
                  <div className={styles.avatar}>
                    <SparkIcon size={15} />
                  </div>
                  <div className={styles.assistantCol}>
                    <Markdown content={message.content} className={styles.assistantBubble} />
                    <MessageModelTag message={message} />
                    {payload?.kind === 'questions' && <QuestionsBlock payload={payload} onSend={send} disabled={pending} />}
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
            {pending && (
              <div className={styles.thinking}>
                <Spinner size="sm" /> The studio is thinking…
              </div>
            )}
          </div>
        </div>

        <div className={styles.composer}>
          <div className={styles.composerInner}>
            <Textarea
              value={input}
              onValueChange={setInput}
              placeholder={sessionId ? 'Answer in your own words, or tap an option above…' : 'This idea has no studio conversation.'}
              minRows={1}
              maxRows={6}
              autoGrow
              disabled={pending || !sessionId}
              className={styles.input}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendDraft();
                }
              }}
            />
            <div className={styles.composerBar}>
              <span className={styles.hint}>Every answer lands on the sheet straight away, and everything is revertible.</span>
              <div className={styles.spacer} />
              <Button variant="primary" size="sm" prefix={<SendIcon size={14} />} loading={pending} disabled={pending || !sessionId} onClick={sendDraft}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SheetPane seed={seed} onGraduate={() => setGraduateOpen(true)} />
      {/* Mounted only while open so the title field starts from whatever the sheet says at that moment, and a
          turn landing behind the dialog never rewrites what the author is typing. */}
      {graduateOpen && <GraduateDialog seed={seed} open onOpenChange={setGraduateOpen} />}
    </div>
  );
}

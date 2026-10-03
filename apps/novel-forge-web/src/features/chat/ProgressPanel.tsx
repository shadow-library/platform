import { type Ref, useEffect, useId, useRef, useState } from 'react';
import { Button, Drawer, IconButton } from '@shadow-library/ui';

import { CheckIcon, CloseIcon, WarningIcon } from '@/components/icons';
import { Markdown } from '@/components/nf/Markdown';
import { type ApplyProposalResponse, isApiError, type ProposalResponse, useProposalOpMutation, useProposalQuery } from '@/lib/apis';

import { type AppliedOpState, currentOpState, type OpRun, updateOpState, useOpState } from './applied-op-store';
import { opSubject, REJECTION_SCOPE_LABEL, type RejectionScope, rejectionScopeNote, type SessionMode, type SuggestionDecision } from './chat-view';
import {
  type AppliedPanelChange,
  type CardPanelChange,
  type ChangeGroupView,
  type ChangesView,
  changesView,
  opDependencyPrompt,
  opErrorText,
  type OpPrompt,
  opSequenceStopped,
  type PanelTurn,
  runOpSequence,
  type SourcesView,
  sourcesView,
  type StreamedPanelChange,
  turnRefs,
} from './progress-panel-view';
import styles from './ProgressPanel.module.css';
import { useSuggestionAnswers } from './suggestion-store';
import { useSuggestionAnswering } from './use-suggestion-answering';

const SOURCE_STATUS: Record<string, string> = { running: 'reading', ok: 'read', error: 'couldn’t be read' };

export interface SourcesSectionProps {
  view: SourcesView;
}

export function SourcesSection({ view }: SourcesSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        Sources
      </h3>
      {view.kind === 'empty' ? (
        <p className={styles.empty}>{view.note}</p>
      ) : (
        <ul className={styles.sources}>
          {view.sources.map(source => (
            <li key={source.key} className={styles.source} data-status={source.status}>
              <span className={styles.sourceMark} aria-hidden="true">
                {source.status === 'ok' && <CheckIcon size={12} />}
                {source.status === 'error' && <WarningIcon size={12} />}
                {source.status === 'running' && <span className={styles.sourceDot} />}
              </span>
              {source.label}
              <span className={styles.srOnly}>, {SOURCE_STATUS[source.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface GroupsProps<T> {
  groups: ChangeGroupView<T>[];
  row: (item: T) => React.JSX.Element;
}

function Groups<T>({ groups, row }: GroupsProps<T>): React.JSX.Element {
  return (
    <>
      {groups.map(group => (
        <div key={group.key}>
          <div className={styles.groupLabel}>{group.label}</div>
          <ul className={styles.changeList}>{group.items.map(row)}</ul>
        </div>
      ))}
    </>
  );
}

export function StreamedChangeRow({ change }: { change: StreamedPanelChange }): React.JSX.Element {
  return (
    <li className={styles.change}>
      <span className={styles.changeName}>
        <span className={styles.changeLabel} title={change.label}>
          {change.label}
        </span>
      </span>
    </li>
  );
}

export interface AppliedChangeRowProps {
  change: AppliedPanelChange;
  /** Another row's undo or redo is running; changes of one turn move one at a time. */
  locked: boolean;
  busy: boolean;
  error?: string;
  prompt?: OpPrompt;
  onToggle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

interface WrittenValueProps {
  value: string;
  long: boolean;
}

/** The written value in full view, not behind a hover: the author checks it against the quote. A long one clamps to two lines until opened. */
function WrittenValue({ value, long }: WrittenValueProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.changeValue}>
      <div id={id} className={styles.changeValueText} data-clamped={long && !open ? '' : undefined}>
        <Markdown content={value} />
      </div>
      {long && (
        <button type="button" className={styles.showMore} aria-expanded={open} aria-controls={id} onClick={() => setOpen(current => !current)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export function AppliedChangeRow({ change, locked, busy, error, prompt, onToggle, onConfirm, onCancel }: AppliedChangeRowProps): React.JSX.Element {
  const undo = change.state === 'applied';
  return (
    <li className={styles.change} data-state={change.state}>
      <span className={styles.changeName}>
        <span className={styles.changeLabel} title={change.label}>
          {change.label}
        </span>
        {change.idea && <span className={styles.ideaTag}>idea</span>}
        {change.state === 'reverted' && <span className={styles.srOnly}>, undone</span>}
      </span>
      {change.actionable ? (
        <Button size="sm" variant="ghost" loading={busy} disabled={locked && !busy} aria-label={`${undo ? 'Undo' : 'Redo'} “${change.label}”`} onClick={onToggle}>
          {undo ? 'Undo' : 'Redo'}
        </Button>
      ) : (
        <span />
      )}
      {change.value && <WrittenValue value={change.value} long={change.valueLong} />}
      {change.quote && (
        <span className={styles.changeQuote} title={change.quote}>
          from your message: “{change.quote}”
        </span>
      )}
      {change.state === 'failed' && <span className={styles.changeError}>Couldn’t be saved{change.error ? `: ${change.error}` : ''}</span>}
      {error && (
        <span className={styles.changeError} role="alert">
          {error}
        </span>
      )}
      {prompt && (
        <div className={styles.changePrompt} role="alert">
          <span>{prompt.lead}</span>
          <span className={styles.promptActions}>
            <Button size="sm" variant="secondary" disabled={locked} onClick={onConfirm}>
              {prompt.confirm}
            </Button>
            <Button size="sm" variant="ghost" disabled={locked} onClick={onCancel}>
              Cancel
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}

const CARD_NOTE: Partial<Record<CardPanelChange['state'], string>> = { added: 'Added', undone: 'Added, then undone', declined: 'Not added', replaced: 'Replaced by a newer card' };

export interface CardChangeRowProps {
  change: CardPanelChange;
  busy: boolean;
  onDecide: (decision: SuggestionDecision | undefined) => void;
  onScope: (scope: RejectionScope) => void;
}

export function CardChangeRow({ change, busy, onDecide, onScope }: CardChangeRowProps): React.JSX.Element {
  const note = CARD_NOTE[change.state];
  const pick = (decision: SuggestionDecision): void => onDecide(change.state === decision ? undefined : decision);
  return (
    <li className={styles.change} data-state={change.state}>
      <span className={styles.changeName}>
        <span className={styles.changeLabel} title={change.label}>
          {change.label}
        </span>
      </span>
      {change.decidable ? (
        <span className={styles.decide} role="group" aria-label={`Answer “${change.label}”`}>
          <IconButton size="sm" variant="secondary" icon={<CheckIcon size={12} />} aria-label="Add" pressed={change.state === 'add'} disabled={busy} onClick={() => pick('add')} />
          <IconButton
            size="sm"
            variant="secondary"
            icon={<CloseIcon size={12} />}
            aria-label="Don’t add"
            pressed={change.state === 'decline'}
            disabled={busy}
            onClick={() => pick('decline')}
          />
        </span>
      ) : (
        <span />
      )}
      {change.value && <WrittenValue value={change.value} long={change.valueLong} />}
      {change.quote && (
        <span className={styles.changeQuote} title={change.quote}>
          from your message: “{change.quote}”
        </span>
      )}
      {note && <span className={styles.changeNote}>{note}</span>}
      {!change.decidable && change.state === 'open' && <span className={styles.changeNote}>Answer it on its card in the chat</span>}
      {change.scope && <span className={styles.changeNote}>Won’t be suggested again {rejectionScopeNote(change.scope)}</span>}
      {change.askScope.length > 0 && (
        <div className={styles.changePrompt}>
          <span>Should it ever be suggested again?</span>
          <span className={styles.promptActions} role="group" aria-label={`When to suggest “${change.label}” again`}>
            {change.askScope.map(scope => (
              <Button key={scope} size="sm" variant="secondary" disabled={busy} onClick={() => onScope(scope)}>
                {REJECTION_SCOPE_LABEL[scope]}
              </Button>
            ))}
          </span>
        </div>
      )}
    </li>
  );
}

interface AppliedChangesProps {
  novelId: string;
  proposal: ProposalResponse;
  groups: ChangeGroupView<AppliedPanelChange>[];
}

/** Undo and redo change by change. A refusal naming other changes of the turn is put to the author, then run in the server's order. */
function AppliedChanges({ novelId, proposal, groups }: AppliedChangesProps): React.JSX.Element {
  const op = useProposalOpMutation(novelId);
  const state = useOpState(proposal.id);
  const label = (index: number): string => {
    const change = proposal.changeSet[index];
    return change ? opSubject(change) : `Change ${index + 1}`;
  };
  const update = (change: (current: AppliedOpState) => AppliedOpState): void => updateOpState(proposal.id, change);

  const run = async ({ index, direction, before }: Pick<OpRun, 'index' | 'direction' | 'before'>): Promise<void> => {
    if (currentOpState(proposal.id).busy !== undefined) return;
    update(current => ({ ...current, busy: index, prompt: undefined, errors: new Map([...current.errors].filter(([at]) => at !== index)) }));
    const result = await runOpSequence(opIndex => op.mutateAsync({ proposalId: proposal.id, opIndex, direction }), [...before, index]);
    update(current => {
      const next = { ...current, busy: undefined };
      if (result.kind === 'blocked') return { ...next, prompt: { index, direction, before: result.before, moved: result.moved } };
      if (result.kind === 'done') return next;
      const reason = isApiError(result.error) ? opErrorText(result.error.code, result.error.message) : 'Something went wrong. Try again.';
      const errors = new Map(current.errors).set(result.at, reason);
      if (result.at !== index) errors.set(index, opSequenceStopped(direction, label(result.at), result.moved.map(label)));
      return { ...next, errors };
    });
  };

  return (
    <Groups
      groups={groups}
      row={change => (
        <AppliedChangeRow
          key={change.key}
          change={change}
          locked={state.busy !== undefined}
          busy={state.busy === change.index}
          error={state.errors.get(change.index)}
          prompt={state.prompt?.index === change.index ? opDependencyPrompt(state.prompt.direction, state.prompt.before.map(label), state.prompt.moved.map(label)) : undefined}
          onToggle={() => void run({ index: change.index, direction: change.state === 'applied' ? 'undo' : 'redo', before: [] })}
          onConfirm={() => state.prompt && void run(state.prompt)}
          onCancel={() => update(current => ({ ...current, prompt: undefined }))}
        />
      )}
    />
  );
}

interface CardChangesProps {
  novelId: string;
  proposal: ProposalResponse;
  groups: ChangeGroupView<CardPanelChange>[];
  title?: string;
  onApplied: (result: ApplyProposalResponse) => void;
}

function CardChanges({ novelId, proposal, groups, title, onApplied }: CardChangesProps): React.JSX.Element {
  const { answers, decide, remember, remembering } = useSuggestionAnswering(novelId, proposal, { onApplied });
  const row = (change: CardPanelChange): React.JSX.Element => (
    <CardChangeRow
      key={change.key}
      change={change}
      busy={answers.committing || remembering}
      onDecide={decision => decide(change.index, decision)}
      onScope={scope => remember(change.index, scope)}
    />
  );
  if (!title) return <Groups groups={groups} row={row} />;
  return (
    <div>
      <div className={styles.groupLabel}>{title}</div>
      <ul className={styles.changeList}>{groups.flatMap(group => group.items).map(row)}</ul>
    </div>
  );
}

export interface ChangesSectionProps {
  view: ChangesView;
  sectionRef?: Ref<HTMLElement>;
  applied?: React.ReactNode;
  cards?: React.ReactNode;
}

export function ChangesSection({ view, sectionRef, applied, cards }: ChangesSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section ref={sectionRef} tabIndex={-1} className={styles.section} aria-labelledby={titleId} data-section="changes">
      <h3 id={titleId} className={styles.sectionTitle}>
        Story Bible changes
        {view.kind !== 'empty' && view.count && <span className={styles.sectionMeta}>{view.count}</span>}
      </h3>
      {view.kind === 'empty' && <p className={styles.empty}>{view.note}</p>}
      {view.kind === 'streamed' && (
        <div className={styles.changes}>
          <Groups groups={view.groups} row={change => <StreamedChangeRow key={change.key} change={change} />} />
        </div>
      )}
      {view.kind === 'settled' && (
        <div className={styles.changes}>
          {applied}
          {cards}
        </div>
      )}
    </section>
  );
}

// scrollIntoView also moves every scrollable ancestor, so it dragged the chat screen under the top bar; this moves only the panel's own scroller.
function scrollToTopOfScroller(element: HTMLElement): void {
  for (let scroller = element.parentElement; scroller; scroller = scroller.parentElement) {
    const { overflowY } = getComputedStyle(scroller);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    scroller.scrollTo({ top: scroller.scrollTop + element.getBoundingClientRect().top - scroller.getBoundingClientRect().top });
    return;
  }
}

export interface ProgressPanelProps {
  novelId: string;
  turn: PanelTurn;
  mode: SessionMode;
  onApplied: (result: ApplyProposalResponse) => void;
  /** Bumped to bring the changes into view — a receipt's "Review in panel". */
  reveal: number;
  /** Shown while the panel is held on an earlier turn and another one is running. */
  onBackToCurrent?: () => void;
}

export function ProgressPanel({ novelId, turn, mode, onApplied, reveal, onBackToCurrent }: ProgressPanelProps): React.JSX.Element {
  const refs = turnRefs(turn);
  const appliedQuery = useProposalQuery(novelId, refs.appliedProposalId);
  const cardsQuery = useProposalQuery(novelId, refs.proposalId);
  const applied = appliedQuery.data ?? refs.applied;
  const cards = cardsQuery.data ?? refs.cards;
  const answers = useSuggestionAnswers(cards?.id);
  const changes = changesView({ turn, mode, applied, cards, decisions: answers.decisions, scopes: answers.scopes });
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (reveal === 0) return;
    const section = sectionRef.current;
    if (!section) return;
    scrollToTopOfScroller(section);
    section.focus({ preventScroll: true });
  }, [reveal]);

  // Committing removes the add and decline buttons, which drops their focus to the page.
  const cardsId = cards?.id;
  const cardsPending = cards?.status === 'pending';
  const lastCards = useRef({ id: cardsId, pending: cardsPending });
  useEffect(() => {
    const committed = lastCards.current.id === cardsId && lastCards.current.pending && !cardsPending;
    lastCards.current = { id: cardsId, pending: cardsPending };
    if (committed && document.activeElement === document.body) sectionRef.current?.focus({ preventScroll: true });
  }, [cardsId, cardsPending]);

  return (
    <>
      {onBackToCurrent && (
        <div className={styles.backBar}>
          <Button size="sm" variant="secondary" onClick={onBackToCurrent}>
            Back to the current turn
          </Button>
        </div>
      )}
      <ChangesSection
        view={changes}
        sectionRef={sectionRef}
        applied={changes.kind === 'settled' && applied && changes.applied.length > 0 && <AppliedChanges novelId={novelId} proposal={applied} groups={changes.applied} />}
        cards={
          changes.kind === 'settled' &&
          cards &&
          changes.cards.length > 0 && <CardChanges novelId={novelId} proposal={cards} groups={changes.cards} title={changes.cardsTitle} onApplied={onApplied} />
        }
      />
      <SourcesSection view={sourcesView(turn)} />
    </>
  );
}

export interface ProgressDockProps extends ProgressPanelProps {
  /** Beside the chat only while changes wait for the author's OK, or once asked for. */
  docked: boolean;
  onClose: () => void;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  /** The sheet opened from a receipt: focus goes to the changes rather than the sheet's close button. */
  sheetReveals: boolean;
}

/** The panel beside the chat where the thread keeps its full column, and the same panel as a sheet where it would not. */
export function ProgressDock({ docked, onClose, sheetOpen, onSheetOpenChange, sheetReveals, ...panel }: ProgressDockProps): React.JSX.Element {
  return (
    <>
      {docked && (
        <aside className={styles.panel} aria-label="Story Bible changes">
          <div className={styles.panelBar}>
            <IconButton variant="ghost" size="sm" aria-label="Close panel" icon={<CloseIcon />} onClick={onClose} />
          </div>
          <ProgressPanel {...panel} />
        </aside>
      )}
      <Drawer open={sheetOpen} onOpenChange={onSheetOpenChange} size="sm" onOpenAutoFocus={event => sheetReveals && event.preventDefault()}>
        <Drawer.Header title="Story Bible changes" />
        <Drawer.Body className={styles.sheetBody}>
          <ProgressPanel {...panel} reveal={sheetReveals ? panel.reveal : 0} />
        </Drawer.Body>
      </Drawer>
    </>
  );
}

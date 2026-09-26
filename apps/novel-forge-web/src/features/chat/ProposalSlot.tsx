import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spinner, toast } from '@shadow-library/ui';

import {
  type ApplyProposalResponse,
  type ProposalResponse,
  useApplyProposalMutation,
  useCreateLedgerEntryMutation,
  useDiscardProposalMutation,
  useProposalQuery,
  useRevertProposalMutation,
  useUndoImpactQuery,
  useUpdateProposalMutation,
} from '@/lib/apis';

import { AppliedBlock, type AppliedOrigin, UndoImpactDialog } from './AppliedBlock';
import {
  appliedRows,
  type CardEntryNote,
  commitBarView,
  ideaTopic,
  opWrittenField,
  picksOf,
  picksSentence,
  proposalPresentation,
  type QuoteSource,
  rejectionEntry,
  type RejectionScope,
  suggestionCommit,
  type SuggestionDecision,
} from './chat-view';
import styles from './Chat.module.css';
import { answersSettled, readAnswers, reportUnanswered, writeAnswers } from './suggestion-store';
import { CommitBar, SuggestionCard } from './SuggestionCard';
import { TurnProposalCard } from './TurnProposalCard';

const noop = (): void => undefined;

export interface ProposalSlotProps {
  novelId: string;
  proposalId: string;
  onApplied?: (result: ApplyProposalResponse) => void;
  /** Per-op notes for an organise card, from its receipt's labels. */
  notes?: ReadonlyMap<number, CardEntryNote>;
  /** The note paragraphs each op cites, from an organise receipt. */
  paragraphs?: ReadonlyMap<number, number[]>;
}

/** Any proposal except a chapter plan, which the transcript mounts as its own card beside the reply. */
export function ProposalSlot({ novelId, proposalId, onApplied, notes, paragraphs }: ProposalSlotProps): React.JSX.Element | null {
  const query = useProposalQuery(novelId, proposalId);
  // Once drawn as suggestion cards — or answered before a reload — the group stays mounted after it commits, so a declined card can still
  // ask when to suggest it again and a replaced card can say what had been picked.
  const [grouped, setGrouped] = useState(false);
  if (query.data && !grouped && (proposalPresentation(query.data) === 'suggestions' || readAnswers(query.data.id).decisions.length > 0)) setGrouped(true);
  if (query.isLoading) return <Spinner size="sm" label="Loading the changes" />;
  if (query.error) {
    return (
      <Alert intent="danger" title="Couldn’t load these changes" action={{ label: 'Try again', onClick: () => void query.refetch() }}>
        {query.error.message}
      </Alert>
    );
  }
  const proposal = query.data;
  if (!proposal) return null;

  const presentation = proposalPresentation(proposal);
  const quoteSource = proposal.kind === 'organise' ? 'notes' : 'message';
  if (grouped) return <SuggestionGroup key={proposal.id} novelId={novelId} proposal={proposal} onApplied={onApplied} notes={notes} quoteSource={quoteSource} />;
  if (presentation === 'plan' || presentation === 'legacy') return <TurnProposalCard novelId={novelId} proposal={proposal} onApplied={onApplied} />;
  if (presentation === 'passed') return <div className={styles.caption}>You passed on {proposal.changeSet.length === 1 ? 'this suggestion' : 'these suggestions'}.</div>;
  const origin = proposal.autoApplied || proposal.changeSet.some(op => op.quote) ? 'words' : 'accepted';
  return <AppliedChange novelId={novelId} proposal={proposal} origin={origin} quoteSource={quoteSource} paragraphs={paragraphs} />;
}

interface AppliedChangeProps {
  novelId: string;
  proposal: ProposalResponse;
  origin: AppliedOrigin;
  quoteSource: QuoteSource;
  paragraphs?: ReadonlyMap<number, number[]>;
}

export function AppliedChange({ novelId, proposal, origin, quoteSource, paragraphs }: AppliedChangeProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const impact = useUndoImpactQuery(novelId, proposal.id, confirming);
  const revert = useRevertProposalMutation(novelId);
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const appliedIndexes = new Set((proposal.opResults ?? []).filter(result => result.status === 'applied').map(result => result.index));
  const rows = appliedRows(proposal.changeSet, paragraphs).filter(row => appliedIndexes.size === 0 || appliedIndexes.has(row.index));

  const open = (): void => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirming(true);
  };

  // Undo replaces the block the dialog opened from, so focus goes back to the opener while it exists and to the block once it does not.
  const restoreFocus = (event: Event): void => {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
    else rootRef.current?.focus();
  };

  const undo = (): void => {
    revert.mutate(proposal.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success('Undone — your Story Bible is back as it was');
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <div ref={rootRef} tabIndex={-1} className={styles.focusTarget} data-outcome>
      <AppliedBlock
        rows={rows}
        origin={origin}
        state={proposal.status === 'reverted' ? 'reverted' : 'applied'}
        revertible={proposal.revertible}
        onUndo={open}
        quoteSource={quoteSource}
        bibleLink={
          <Button asChild size="sm" variant="secondary">
            <Link to="/novels/$novelId/story-bible" params={{ novelId }}>
              Open Story Bible
            </Link>
          </Button>
        }
      />
      <UndoImpactDialog
        open={confirming}
        onOpenChange={setConfirming}
        onCloseAutoFocus={restoreFocus}
        impact={impact.data}
        loading={impact.isLoading}
        error={impact.error}
        onRetry={() => void impact.refetch()}
        onConfirm={undo}
        confirming={revert.isPending}
      />
    </div>
  );
}

interface SuggestionGroupProps {
  novelId: string;
  proposal: ProposalResponse;
  onApplied?: (result: ApplyProposalResponse) => void;
  notes?: ReadonlyMap<number, CardEntryNote>;
  quoteSource: QuoteSource;
}

function SuggestionGroup({ novelId, proposal, onApplied, notes, quoteSource }: SuggestionGroupProps): React.JSX.Element {
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const update = useUpdateProposalMutation(novelId);
  const remember = useCreateLedgerEntryMutation(novelId);
  const [stored] = useState(() => readAnswers(proposal.id));
  const [decisions, setDecisions] = useState<ReadonlyMap<number, SuggestionDecision>>(() => new Map(stored.decisions));
  const [scopes, setScopes] = useState<ReadonlyMap<number, RejectionScope>>(() => new Map(stored.scopes));
  const [drafts, setDrafts] = useState<ReadonlyMap<number, string>>(new Map());
  const [commitError, setCommitError] = useState<string>();
  const focusTarget = useRef<number | 'outcome' | undefined>(undefined);
  const groupRef = useRef<HTMLDivElement>(null);
  const committing = apply.isPending || discard.isPending;
  const busy = committing || update.isPending || remember.isPending;
  const total = proposal.changeSet.length;
  const pending = proposal.status === 'pending';
  const remaining = total - decisions.size;
  const finished = answersSettled(proposal.status, decisions, scopes);

  useEffect(() => {
    writeAnswers(proposal.id, finished ? { decisions: [], scopes: [] } : { decisions: [...decisions.entries()], scopes: [...scopes.entries()] });
  }, [decisions, finished, proposal.id, scopes]);

  useEffect(() => {
    reportUnanswered(proposal.id, pending && decisions.size > 0 ? remaining : 0);
    return () => reportUnanswered(proposal.id, 0);
  }, [decisions.size, pending, proposal.id, remaining]);

  // A decision swaps the card for another element, which would drop focus to the page; it moves to the replacement's first control, and
  // after the last answer commits, to the applied block — or to the group itself when nothing was applied.
  useEffect(() => {
    const target = focusTarget.current;
    if (target === undefined) return;
    if (target === 'outcome' && pending) return;
    focusTarget.current = undefined;
    if (target === 'outcome') return void (groupRef.current?.querySelector<HTMLElement>('[data-outcome]') ?? groupRef.current)?.focus();
    const card = groupRef.current?.querySelector<HTMLElement>(`[data-card="${target}"]`);
    (card?.querySelector<HTMLElement>('button:not([disabled]), textarea') ?? card)?.focus();
  });

  const commit = (next: ReadonlyMap<number, SuggestionDecision>, force = false): void => {
    const plan = suggestionCommit(total, next, force);
    if (plan.kind === 'wait') return;
    setCommitError(undefined);
    const onError = (err: Error): void => setCommitError(err.message);
    if (plan.kind === 'discard') return void discard.mutate(proposal.id, { onSuccess: () => (focusTarget.current = 'outcome'), onError });
    apply.mutate(
      { proposalId: proposal.id, opIndexes: plan.opIndexes },
      {
        onSuccess: result => {
          focusTarget.current = 'outcome';
          onApplied?.(result);
          const failed = result.opResults.filter(op => op.status === 'failed');
          if (failed.length > 0) toast.danger(`${failed.length} couldn’t be added: ${failed[0]?.error ?? 'the Story Bible refused it'}`);
        },
        onError,
      },
    );
  };

  const decide = (index: number, decision: SuggestionDecision | undefined): void => {
    const next = new Map(decisions);
    if (decision) next.set(index, decision);
    else next.delete(index);
    setDecisions(next);
    focusTarget.current = index;
    if (decision) commit(next);
  };

  const setDraft = (index: number, value: string | undefined): void => {
    setDrafts(current => {
      const next = new Map(current);
      if (value === undefined) next.delete(index);
      else next.set(index, value);
      return next;
    });
    focusTarget.current = index;
  };

  const saveEdit = (index: number): void => {
    const op = proposal.changeSet[index];
    const field = op && opWrittenField(op);
    const draft = drafts.get(index);
    if (!op || !field || draft === undefined) return;
    const changeSet = proposal.changeSet.map((entry, at) => (at === index ? { ...entry, [field]: draft.trim() } : entry));
    update.mutate(
      { proposalId: proposal.id, changeSet },
      {
        onSuccess: () => {
          setDraft(index, undefined);
          decide(index, 'add');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const recordScope = (index: number, scope: RejectionScope): void => {
    const op = proposal.changeSet[index];
    if (!op) return;
    const entry = rejectionEntry(op, scope);
    remember.mutate(
      { ...entry, topic: ideaTopic(op), payload: { scope, proposalId: proposal.id, opIndex: index } },
      {
        onSuccess: () => setScopes(current => new Map(current).set(index, scope)),
        onError: err => toast.danger(err.message),
      },
    );
  };

  if (!pending) {
    const declined = proposal.changeSet.map((op, index) => ({ op, index })).filter(({ index }) => decisions.get(index) === 'decline');
    const replaced = proposal.status === 'superseded' || proposal.status === 'conflicted';
    return (
      <div ref={groupRef} tabIndex={-1} className={`${styles.suggestions} ${styles.focusTarget}`}>
        {(proposal.status === 'applied' || proposal.status === 'reverted') && <AppliedChange novelId={novelId} proposal={proposal} origin="accepted" quoteSource={quoteSource} />}
        {proposal.status === 'discarded' && declined.length === 0 && <div className={styles.caption}>You passed on {total === 1 ? 'this suggestion' : 'these suggestions'}.</div>}
        {replaced && (
          <div className={styles.notice} data-status={proposal.status}>
            <span>
              {proposal.status === 'superseded'
                ? 'A newer card replaced this one before anything was added.'
                : 'The Story Bible changed since this card was drafted, so nothing was added. Ask again for a fresh one.'}
            </span>
            <span className={styles.caption}>{picksSentence(picksOf(proposal.changeSet, decisions))}</span>
          </div>
        )}
        {!replaced &&
          declined.map(({ op, index }) => (
            <div key={index} data-card={index}>
              <SuggestionCard
                op={op}
                note={notes?.get(index)}
                decision="decline"
                scope={scopes.get(index)}
                remaining={0}
                busy={remember.isPending}
                onAdd={noop}
                onEditFirst={noop}
                onDraftChange={noop}
                onSaveEdit={noop}
                onCancelEdit={noop}
                onDecline={noop}
                onUndoDecision={noop}
                canUndo={false}
                onScope={scope => recordScope(index, scope)}
              />
            </div>
          ))}
      </div>
    );
  }

  return (
    <div ref={groupRef} tabIndex={-1} className={`${styles.suggestions} ${styles.focusTarget}`}>
      {proposal.changeSet.map((op, index) => (
        <div key={index} data-card={index}>
          <SuggestionCard
            op={op}
            note={notes?.get(index)}
            decision={decisions.get(index)}
            scope={scopes.get(index)}
            remaining={remaining}
            committing={committing}
            draft={drafts.get(index)}
            busy={busy}
            onAdd={() => decide(index, 'add')}
            onEditFirst={() => {
              const field = opWrittenField(op);
              setDraft(index, field ? String(op[field] ?? '') : '');
            }}
            onDraftChange={value => setDrafts(current => new Map(current).set(index, value))}
            onSaveEdit={() => saveEdit(index)}
            onCancelEdit={() => setDraft(index, undefined)}
            onDecline={() => decide(index, 'decline')}
            onUndoDecision={() => decide(index, undefined)}
            onScope={scope => recordScope(index, scope)}
          />
        </div>
      ))}
      <CommitBar view={commitBarView({ total, decisions, committing, error: commitError })} onCommit={() => commit(decisions, true)} />
    </div>
  );
}

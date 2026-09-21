import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Fragment, useState } from 'react';
import { Alert, Button, Checkbox, ConfirmDialog, toast } from '@shadow-library/ui';

import { type ChipIntent, DetailPage, ItemPager, type ItemPagerJump, Markdown, RegenerateAppliedBriefs, StatusChip } from '@/components/nf';
import { type ProposalResponse, useAiModelsQuery, useApplyProposalMutation, useDiscardProposalMutation, useListPluginsQuery, useRevertProposalMutation } from '@/lib/apis';
import { appliedBriefChapters } from '@/lib/chapter-brief';
import { relativeTime } from '@/lib/format';
import { modelLabel } from '@/lib/model-defaults';
import {
  applyButtonLabel,
  backLabel,
  type ChangeOp,
  defaultDeclined,
  isGuardedOp,
  NEVER_AUTO_NOTE,
  nextAfterDecision,
  opLabel,
  parseProposalFilter,
  proposalDisposition,
  type ProposalFilter,
  proposalTitle,
  selectedOpIndexes,
} from '@/lib/proposals';

import styles from './proposals.module.css';

interface ProposalRedirectSearch {
  filter?: ProposalFilter;
  proposal?: string;
}

// The Proposals directory merged into the Review Queue (routes/novels/$novelId/review.tsx) — every pending
// proposal type belongs in one inbox. This route survives only to bounce old links to the queue's Proposals
// section; `ProposalDetail`/`ChangeOpBody`/`PluginSourceChip` below are what the queue reuses for the detail view.
export const Route = createFileRoute('/novels/$novelId/proposals')({
  validateSearch: (search: Record<string, unknown>): ProposalRedirectSearch => ({
    filter: parseProposalFilter(search.filter),
    proposal: typeof search.proposal === 'string' && search.proposal ? search.proposal : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: '/novels/$novelId/review', params, search: { view: 'proposals', filter: search.filter, proposal: search.proposal }, replace: true });
  },
});

const STATUS_INTENT: Record<string, ChipIntent> = {
  pending: 'warning',
  applied: 'success',
  discarded: 'neutral',
  superseded: 'neutral',
  conflicted: 'danger',
  reverted: 'info',
};

const OP_RESULT_INTENT: Record<string, ChipIntent> = {
  applied: 'success',
  declined: 'neutral',
  failed: 'danger',
  pending: 'warning',
};

export function statusIntent(status: string): ChipIntent {
  return STATUS_INTENT[status] ?? 'neutral';
}

// Fields whose values are prose/Markdown — shown as a rendered block instead of an inline value.
const OP_PROSE_FIELDS = new Set([
  'body',
  'premise',
  'brief',
  'objective',
  'escalation',
  'payoff',
  'hook',
  'conflict',
  'motivation',
  'notes',
  'summary',
  'chapterSummary',
  'instructions',
  'note',
]);

function formatOpValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A readable view of one change-set op: the identifying/scalar fields as a compact key/value grid,
 * and the prose fields (a rewritten body, a new objective, a revision note) rendered as Markdown —
 * so a change reads as what it does, not as a raw JSON blob. Also reused for a continuity proposal's
 * findings, whose blob has no `op` field of its own.
 */
export function ChangeOpBody({ op }: { op: ChangeOp }): React.JSX.Element {
  const rationale = typeof op.rationale === 'string' ? op.rationale.trim() : '';
  const entries = Object.entries(op).filter(([k]) => k !== 'op' && k !== 'rationale' && op[k] !== undefined);
  const prose = entries.filter(([k, v]) => OP_PROSE_FIELDS.has(k) && typeof v === 'string' && v.trim() !== '');
  const inline = entries.filter(([k, v]) => !prose.some(([pk]) => pk === k) && v !== undefined);

  return (
    <div className={styles.opBody}>
      {rationale !== '' && <div className={styles.opRationale}>{rationale}</div>}
      {inline.length > 0 && (
        <div className={styles.opFields}>
          {inline.map(([k, v]) => (
            <Fragment key={k}>
              <span className={styles.opFieldKey}>{k}</span>
              <span className={styles.opFieldVal}>{formatOpValue(v)}</span>
            </Fragment>
          ))}
        </div>
      )}
      {prose.map(([k, v]) => (
        <div key={k}>
          <div className={styles.opProseLabel}>{k}</div>
          <Markdown content={v as string} className={styles.opProse} />
        </div>
      ))}
    </div>
  );
}

/** A plugin proposal's `scopeRef` is the id of the plugin that staged it. */
export function PluginSourceChip({ proposal }: { proposal: ProposalResponse }): React.JSX.Element | null {
  const isPlugin = proposal.kind === 'plugin' && Boolean(proposal.scopeRef);
  const pluginsQuery = useListPluginsQuery(isPlugin);
  if (!isPlugin) return null;
  return <StatusChip intent="accent">{pluginsQuery.data?.find(manifest => manifest.id === proposal.scopeRef)?.title ?? proposal.scopeRef}</StatusChip>;
}

export interface ProposalDetailProps {
  novelId: string;
  proposal: ProposalResponse;
  total: number | undefined;
  filter: ProposalFilter | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (proposalId?: string) => void;
}

export function ProposalDetail({ novelId, proposal, total, filter, ids, jump, onSelect }: ProposalDetailProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const disposition = proposalDisposition(proposal);
  const deciding = disposition.kind === 'decide';
  const [declined, setDeclined] = useState<Set<number>>(() => defaultDeclined(proposal.changeSet));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const opResults = (proposal.opResults ?? []) as { index: number; status: string; error?: string; result?: Record<string, unknown> }[];
  const regenerateChapters = appliedBriefChapters(proposal);

  // The selection is keyed to one proposal's op indexes, so paging to another proposal resets it during
  // render rather than in an effect — an effect would paint one frame of the old selection.
  const [selectionFor, setSelectionFor] = useState(proposal.id);
  if (selectionFor !== proposal.id) {
    setSelectionFor(proposal.id);
    setDeclined(defaultDeclined(proposal.changeSet));
  }

  const toggleOp = (index: number): void => {
    setDeclined(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Applying leaves op results on this very proposal — the only record of which ops landed — so the
  // author stays on it, unlike a discard, which has nothing left to read.
  const doApply = (): void => {
    const selected = selectedOpIndexes(proposal.changeSet.length, declined);
    if (selected.length === 0) return void toast.danger('Select at least one operation to apply');
    // Always explicit: a blanket apply (no `opIndexes`) is refused outright when the change-set holds a
    // one-way door, so naming the indexes is what makes finalize and graduation reachable at all.
    apply.mutate(
      { proposalId: proposal.id, opIndexes: selected },
      {
        onSuccess: r => {
          const failed = r.opResults.filter(o => o.status === 'failed');
          if (failed.length > 0) toast.danger(`Applied with ${failed.length} failed action(s) — see the op results`);
          else toast.success(selected.length === proposal.changeSet.length ? 'Applied to canon' : `Applied ${selected.length} of ${proposal.changeSet.length} ops`);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const doDiscard = (): void => {
    const next = nextAfterDecision(ids, proposal.id);
    discard.mutate(proposal.id, {
      onSuccess: () => {
        toast.success('Proposal discarded');
        setConfirmDiscard(false);
        onSelect(next);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const doRevert = (): void => {
    revert.mutate(proposal.id, {
      onSuccess: r => toast.success(`Reverted ${r.reverted.length} artifact(s)`),
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals', filter }}>
            {backLabel(total)}
          </Link>
        }
        identity={
          <DetailPage.Identity title={proposalTitle(proposal)}>
            <StatusChip intent={statusIntent(proposal.status)} dot>
              {proposal.status}
            </StatusChip>
            <PluginSourceChip proposal={proposal} />
            {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
          </DetailPage.Identity>
        }
        pager={<ItemPager ids={ids} currentId={proposal.id} onSelect={onSelect} itemNoun="proposal" jump={jump} />}
        asideLabel="Proposal decision"
        aside={
          <>
            <section className={styles.asideBlock}>
              <h2 className={styles.asideTitle}>Decision</h2>
              {disposition.kind === 'decide' && (
                <div className={styles.decision}>
                  <Button variant="primary" fullWidth loading={apply.isPending} onClick={doApply}>
                    {applyButtonLabel(proposal.changeSet.length, declined.size)}
                  </Button>
                  <Button variant="secondary" fullWidth loading={discard.isPending} onClick={() => setConfirmDiscard(true)}>
                    Discard
                  </Button>
                </div>
              )}
              {disposition.kind === 'blocked' && (
                <div className={styles.decision}>
                  <p className={styles.asideNote}>{disposition.note}</p>
                  <Button variant="danger" fullWidth loading={discard.isPending} onClick={() => setConfirmDiscard(true)}>
                    Discard
                  </Button>
                </div>
              )}
              {disposition.kind === 'revert' && (
                <div className={styles.decision}>
                  <p className={styles.asideNote}>{disposition.note}</p>
                  <Button variant="danger" fullWidth loading={revert.isPending} onClick={doRevert}>
                    Revert this change
                  </Button>
                </div>
              )}
              {disposition.kind === 'settled' && <p className={styles.asideNote}>{disposition.note}</p>}
            </section>

            {regenerateChapters.length > 0 && (
              <section className={styles.asideBlock}>
                <RegenerateAppliedBriefs novelId={novelId} chapters={regenerateChapters} fullWidth />
              </section>
            )}

            <section className={styles.asideBlock}>
              <h2 className={styles.asideTitle}>Origin</h2>
              <dl className={styles.originGrid}>
                <dt>Kind</dt>
                <dd>{proposal.kind}</dd>
                <dt>Scope</dt>
                <dd>{proposal.scopeType}</dd>
                <dt>Staged</dt>
                <dd>{relativeTime(proposal.createdAt)}</dd>
                {proposal.model && (
                  <>
                    <dt>Model</dt>
                    <dd className={styles.model}>{modelLabel(modelsQuery.data?.models ?? [], proposal.model)}</dd>
                  </>
                )}
              </dl>
            </section>
          </>
        }
      >
        {disposition.kind === 'blocked' && (
          <Alert intent="danger" title="Baseline changed underneath this proposal" className={styles.conflict}>
            {disposition.note}
          </Alert>
        )}

        {proposal.warnings.length > 0 && (
          <Alert intent="warning" title="Check these before applying" className={styles.conflict}>
            <ul className={styles.warningList}>
              {proposal.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className={`nf-eyebrow ${styles.changeSetLabel}`}>
          Proposed change-set · {proposal.changeSet.length} op{proposal.changeSet.length === 1 ? '' : 's'}
          {deciding && ' · untick to decline'}
        </div>
        <div className={styles.changeSet}>
          {proposal.changeSet.map((op, i) => {
            const result = opResults.find(r => r.index === i);
            return (
              <div key={i} className={styles.opRow} data-declined={declined.has(i)}>
                <div className={styles.opHead}>
                  {deciding && <Checkbox checked={!declined.has(i)} onCheckedChange={() => toggleOp(i)} aria-label={`include ${opLabel(op)}`} />}
                  <span className={styles.opLabel}>{opLabel(op)}</span>
                  {String(op.op).startsWith('action.') && <StatusChip intent="info">action</StatusChip>}
                  <div className={styles.spacer} />
                  {result && <StatusChip intent={OP_RESULT_INTENT[result.status] ?? 'neutral'}>{result.status}</StatusChip>}
                </div>
                {deciding && isGuardedOp(op) && <div className={styles.opNote}>{NEVER_AUTO_NOTE}</div>}
                <ChangeOpBody op={op} />
                {result?.error && <div className={styles.opError}>{result.error}</div>}
                {result?.result?.summary !== undefined && <div className={styles.opSummary}>{String(result.result.summary)}</div>}
              </div>
            );
          })}
        </div>
      </DetailPage>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        intent="danger"
        title="Discard this proposal?"
        description="Its change-set won't be applied to canon. This cannot be undone."
        confirmLabel="Discard"
        loading={discard.isPending}
        onConfirm={doDiscard}
      />
    </>
  );
}

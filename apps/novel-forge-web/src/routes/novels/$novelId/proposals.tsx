import { createFileRoute, Link } from '@tanstack/react-router';
import { Fragment, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, toast } from '@shadow-library/ui';

import { ProposalsIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { type ChipIntent, CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, Markdown, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  listProposalsQueryOptions,
  type ProposalResponse,
  useAiModelsQuery,
  useApplyProposalMutation,
  useDiscardProposalMutation,
  useListPluginsQuery,
  useListProposalsQuery,
  useRevertProposalMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';
import { modelLabel } from '@/lib/model-defaults';
import {
  applyButtonLabel,
  backLabel,
  type ChangeOp,
  changeSetCaption,
  countByFilter,
  defaultDeclined,
  FILTER_LABEL,
  filterProposals,
  isGuardedOp,
  NEVER_AUTO_NOTE,
  nextAfterDecision,
  opLabel,
  parseProposalFilter,
  proposalDisposition,
  type ProposalFilter,
  proposalIds,
  proposalMeta,
  proposalTitle,
  selectedOpIndexes,
} from '@/lib/proposals';

import styles from './proposals.module.css';

interface ProposalsSearch {
  filter?: ProposalFilter;
  proposal?: string;
}

export const Route = createFileRoute('/novels/$novelId/proposals')({
  validateSearch: (search: Record<string, unknown>): ProposalsSearch => ({
    filter: parseProposalFilter(search.filter),
    proposal: typeof search.proposal === 'string' && search.proposal ? search.proposal : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listProposalsQueryOptions(params.novelId, { limit: 100 })),
  component: ProposalsScreen,
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

function statusIntent(status: string): ChipIntent {
  return STATUS_INTENT[status] ?? 'neutral';
}

// Fields whose values are prose/Markdown — shown as a rendered block instead of an inline value.
const OP_PROSE_FIELDS = new Set(['body', 'premise', 'brief', 'objective', 'escalation', 'payoff', 'hook', 'conflict', 'motivation', 'notes', 'summary', 'instructions', 'note']);

function formatOpValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(v => String(v)).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A readable view of one change-set op: the identifying/scalar fields as a compact key/value grid,
 * and the prose fields (a rewritten body, a new objective, a revision note) rendered as Markdown —
 * so a change reads as what it does, not as a raw JSON blob.
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

interface ProposalDetailProps {
  novelId: string;
  proposal: ProposalResponse;
  total: number | undefined;
  filter: ProposalFilter | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (proposalId?: string) => void;
}

function ProposalDetail({ novelId, proposal, total, filter, ids, jump, onSelect }: ProposalDetailProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const apply = useApplyProposalMutation(novelId);
  const discard = useDiscardProposalMutation(novelId);
  const revert = useRevertProposalMutation(novelId);
  const disposition = proposalDisposition(proposal);
  const deciding = disposition.kind === 'decide';
  const [declined, setDeclined] = useState<Set<number>>(() => defaultDeclined(proposal.changeSet));
  const opResults = (proposal.opResults ?? []) as { index: number; status: string; error?: string; result?: Record<string, unknown> }[];

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
    <DetailPage
      back={
        <Link to="/novels/$novelId/proposals" params={{ novelId }} search={{ filter }}>
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
                <Button variant="secondary" fullWidth loading={discard.isPending} onClick={doDiscard}>
                  Discard
                </Button>
              </div>
            )}
            {disposition.kind === 'blocked' && (
              <div className={styles.decision}>
                <p className={styles.asideNote}>{disposition.note}</p>
                <Button variant="danger" fullWidth loading={discard.isPending} onClick={doDiscard}>
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
  );
}

function ProposalsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { filter: filterParam, proposal: proposalParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const proposalsQuery = useListProposalsQuery(novelId, { limit: 100 });
  const proposals = useMemo(() => proposalsQuery.data?.items ?? [], [proposalsQuery.data]);

  const resolved = !proposalsQuery.isLoading && !proposalsQuery.error;
  const total = resolved ? proposals.length : undefined;
  const activeFilter: ProposalFilter = filterParam ?? 'open';

  const counts = useMemo(() => countByFilter(proposals), [proposals]);
  const visible = useMemo(() => filterProposals(proposals, activeFilter), [proposals, activeFilter]);
  const byId = useMemo(() => new Map(proposals.map(proposal => [proposal.id, proposal])), [proposals]);
  const visibleIds = useMemo(() => (resolved ? proposalIds(visible) : undefined), [resolved, visible]);

  const selected = proposalParam ? byId.get(proposalParam) : undefined;
  const selectProposal = (proposalId?: string): void => void goSearch({ search: { filter: filterParam, proposal: proposalId } });
  const pickFilter = (value: string): void => void goSearch({ search: { filter: parseProposalFilter(value) } });

  const jumpItems = useMemo(() => visible.map(proposal => ({ id: proposal.id, label: proposalTitle(proposal), caption: changeSetCaption(proposal.changeSet) })), [visible]);
  const allJumpItems = useMemo(
    () => (activeFilter === 'all' ? undefined : proposals.map(proposal => ({ id: proposal.id, label: proposalTitle(proposal), caption: changeSetCaption(proposal.changeSet) }))),
    [activeFilter, proposals],
  );
  const jump = useCollectionJump(
    resolved
      ? {
          collection: 'proposals',
          items: jumpItems,
          filterLabel: FILTER_LABEL[activeFilter],
          allItems: allJumpItems,
          currentId: proposalParam,
          onSelect: selectProposal,
        }
      : null,
  );

  if (selected) return <ProposalDetail novelId={novelId} proposal={selected} total={total} filter={filterParam} ids={visibleIds} jump={jump} onSelect={selectProposal} />;

  return (
    <CollectionPage
      title="Proposals"
      subtitle="Change-sets a chat turn, an analysis pass or a plugin staged against canon — nothing lands until you apply it."
      total={total}
      notice={
        resolved &&
        proposalParam && (
          <Alert intent="warning" title="That proposal is no longer here." action={{ label: 'Back to the directory', onClick: () => selectProposal(undefined) }}>
            It was superseded by a newer draft, or the link was typed by hand.
          </Alert>
        )
      }
      segments={{
        label: 'Proposal state',
        value: activeFilter,
        onValueChange: pickFilter,
        items: [
          { value: 'open', label: FILTER_LABEL.open, count: counts.open },
          { value: 'applied', label: FILTER_LABEL.applied, count: counts.applied },
          { value: 'all', label: FILTER_LABEL.all, count: counts.all },
        ],
      }}
      empty={
        <EmptyState
          icon={<ProposalsIcon size={24} />}
          title="No proposals staged"
          description="A proposal appears here when a refinement chat turn, an analysis pass or a plugin drafts a change-set against this novel's canon."
          actions={
            <Button variant="primary" asChild>
              <Link to="/novels/$novelId/chat" params={{ novelId }}>
                Open refinement chat
              </Link>
            </Button>
          }
        />
      }
    >
      {proposalsQuery.isLoading ? (
        <PaneLoader />
      ) : proposalsQuery.error ? (
        <PaneError error={proposalsQuery.error} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ProposalsIcon size={24} />}
          title={activeFilter === 'open' ? 'Nothing is waiting on you' : 'No applied proposals'}
          description={
            activeFilter === 'open'
              ? 'Every proposal staged against this novel has been applied, discarded or superseded.'
              : 'No proposal has been applied to canon yet — open ones are still waiting on your decision.'
          }
          actions={
            <Button variant="secondary" onClick={() => pickFilter('all')}>
              See all {counts.all}
            </Button>
          }
        />
      ) : (
        <CollectionPage.Rows>
          {visible.map(proposal => (
            <CollectionPage.Row
              key={proposal.id}
              link={<Link to="/novels/$novelId/proposals" params={{ novelId }} search={{ filter: filterParam, proposal: proposal.id }} />}
              title={proposalTitle(proposal)}
              caption={changeSetCaption(proposal.changeSet)}
              clampCaption
              trailing={
                <>
                  <StatusChip intent={statusIntent(proposal.status)} dot>
                    {proposal.status}
                  </StatusChip>
                  <PluginSourceChip proposal={proposal} />
                  {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
                </>
              }
              meta={proposalMeta(proposal)}
            />
          ))}
        </CollectionPage.Rows>
      )}
    </CollectionPage>
  );
}

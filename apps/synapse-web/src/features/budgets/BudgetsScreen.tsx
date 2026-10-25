import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactElement, useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Spinner, useConfirm } from '@shadow-library/ui';

import { type ActiveCatalogState, useActiveCatalog } from '@/features/catalog';
import { type Notice, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  budgetStatusQueryOptions,
  type Capabilities,
  type CatalogIssueResponse,
  catalogKeys,
  isApiError,
  isCatalogConflict,
  isNoActiveCatalog,
  useCapabilities,
  usePublishBudgetsMutation,
} from '@/lib';

import { BudgetCard, type BudgetCardActions } from './BudgetCard';
import { BudgetDrawer, type BudgetDrawerTarget, type BudgetSubmitOutcome, type PublishStage } from './BudgetDrawer';
import { type BudgetBasis, budgetBasisOf, type BudgetChange, budgetNote, planBudgetPublish } from './budget-form';
import { BudgetIssues } from './BudgetIssues';
import styles from './Budgets.module.css';
import { budgetCards, type BudgetCardView } from './budget-view';

type ScreenNotice = Notice & { issues?: CatalogIssueResponse[] };

interface Editor {
  target: BudgetDrawerTarget;
  basis: BudgetBasis;
}

const STATUS_REFRESH_MS = 30_000;

const CONFLICT_NOTICE: ScreenNotice = {
  intent: 'warning',
  title: 'The catalog changed meanwhile',
  body: 'Someone else changed the catalog while you were editing, so the budgets were not changed. The screen has reloaded; make your change again.',
};

const SUBTITLE = 'Limits on what each app may spend on AI, and how close each one is to its limit right now.';

export function BudgetsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readUsage} area="budgets">
      <BudgetsView capabilities={capabilities} />
    </PermissionGate>
  );
}

function editHint(capabilities: Capabilities, active: ActiveCatalogState): string | null {
  if (!capabilities.setBudgets) return 'Ask a Synapse administrator for budget access.';
  if (!capabilities.readCatalog) return 'Changing budgets also needs permission to read the catalog.';
  if (active.status === 'error') return 'Budgets can’t be changed right now: the active catalog couldn’t be loaded.';
  return null;
}

/** A dialog description renders inside a paragraph, so this keeps to inline elements laid out as blocks. */
function ConfirmBody({ sentences }: { sentences: readonly string[] }): ReactElement {
  return (
    <span className={styles.confirmBody}>
      <span className={styles.confirmLine}>This takes effect for every app within a minute.</span>
      {sentences.map((sentence, position) => (
        <span key={`${position}:${sentence}`} className={styles.confirmLine}>
          {sentence}
        </span>
      ))}
    </span>
  );
}

function BudgetsView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const status = useQuery({ ...budgetStatusQueryOptions(), refetchInterval: STATUS_REFRESH_MS });
  const active = useActiveCatalog(capabilities.readCatalog);
  const publish = usePublishBudgetsMutation();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const basis = active.status === 'ready' ? budgetBasisOf(active.version, active.document) : null;
  const reportVersion = status.data?.catalogVersion;
  const activeVersion = basis?.version;

  useEffect(() => {
    if (reportVersion === undefined || activeVersion === undefined || reportVersion <= activeVersion) return;
    void queryClient.invalidateQueries({ queryKey: catalogKeys.versions() });
  }, [reportVersion, activeVersion, queryClient]);

  const canEdit = capabilities.setBudgets && basis !== null;
  const entries = basis?.entries ?? [];
  const cards = budgetCards({ ...(status.data && { status: status.data }), ...(basis && { active: { version: basis.version, budgets: entries } }) });
  const hint = editHint(capabilities, active);

  const openEditor = (target: BudgetDrawerTarget): void => {
    if (basis) setEditor({ target, basis });
  };

  const publishChange = async (from: BudgetBasis, change: BudgetChange, typedNote: string, onStage: (stage: PublishStage) => void): Promise<BudgetSubmitOutcome> => {
    const plan = planBudgetPublish(from, change);
    if (!plan) return { kind: 'kept' };
    const removal = change.kind === 'remove';
    onStage('confirming');
    const confirmed = await confirm({
      title: removal ? 'Remove this budget?' : 'Apply this budget change?',
      description: <ConfirmBody sentences={plan.changes.map(item => item.sentence)} />,
      confirmLabel: removal ? 'Remove budget' : 'Apply',
      intent: removal ? 'danger' : 'primary',
    });
    if (!confirmed) return { kind: 'kept' };
    onStage('publishing');
    setNotice(null);
    try {
      const outcome = await publish.mutateAsync({ budgets: plan.budgets, expectedVersion: plan.expectedVersion, note: budgetNote(plan.changes, typedNote) });
      if (outcome.kind === 'invalid') return { kind: 'invalid', issues: outcome.issues };
      setEditor(null);
      setNotice({ intent: 'success', title: `Budgets updated — live as version ${outcome.value.version}`, body: 'Every app applies the new limits within a minute.' });
      return { kind: 'done' };
    } catch (error) {
      if (!isCatalogConflict(error)) return { kind: 'failed', message: isApiError(error) ? error.message : 'The budgets couldn’t be changed.' };
      setEditor(null);
      setNotice(CONFLICT_NOTICE);
      return { kind: 'done' };
    }
  };

  const remove = async (card: BudgetCardView): Promise<void> => {
    if (!basis || removing !== null) return;
    const outcome = await publishChange(basis, { kind: 'remove', index: card.index }, '', stage => stage === 'publishing' && setRemoving(card.index));
    setRemoving(null);
    if (outcome.kind === 'invalid') setNotice({ intent: 'danger', title: 'The budget was not removed', issues: outcome.issues });
    if (outcome.kind === 'failed') setNotice({ intent: 'danger', title: 'The budget was not removed', body: outcome.message });
  };

  const editTarget = (card: BudgetCardView): BudgetDrawerTarget | null => {
    const entry = entries.find(candidate => candidate.index === card.index);
    return entry ? { kind: 'edit', entry } : null;
  };

  const header = (
    <PageHeader
      title="Budgets"
      subtitle={SUBTITLE}
      action={
        canEdit ? (
          <Button variant="primary" onClick={() => openEditor({ kind: 'add' })}>
            Add budget
          </Button>
        ) : null
      }
    />
  );

  const noCatalog = (status.error && isNoActiveCatalog(status.error)) || active.status === 'none';
  if (noCatalog)
    return (
      <>
        {header}
        <EmptyState title="No catalog is live yet" description="Budgets apply once a first catalog version goes live." />
      </>
    );

  return (
    <>
      {header}
      <Alert intent="info" title="Budgets count API-price cost" className={styles.notice}>
        That is what calls would cost at the providers’ list prices, so free subscription calls still use budget. Billed spend is on the Usage screen.
      </Alert>
      <p className={styles.windows}>Windows are fixed UTC periods: each hour, each day, or 30-day blocks — not calendar months. Counts start again from zero when a window ends.</p>
      {hint ? <p className={controls.hint}>{hint}</p> : null}
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
          {notice.issues ? <BudgetIssues issues={notice.issues} /> : null}
        </Alert>
      ) : null}
      <BudgetList
        cards={cards}
        loading={status.isPending || (status.isError && capabilities.readCatalog && active.status === 'loading')}
        statusError={status.error && !status.data && !isNoActiveCatalog(status.error) ? status.error.message : null}
        catalogError={active.status === 'error' ? active.error.message : null}
        emptyAction={canEdit ? { label: 'Add budget', onClick: () => openEditor({ kind: 'add' }) } : undefined}
        renderActions={card => {
          const edit = canEdit ? editTarget(card) : null;
          if (!edit) return undefined;
          return { onEdit: () => openEditor(edit), onRemove: () => void remove(card), removing: removing === card.index };
        }}
      />
      {editor ? <BudgetDrawer target={editor.target} basis={editor.basis} onSubmit={publishChange} onClose={() => setEditor(null)} /> : null}
    </>
  );
}

interface BudgetListProps {
  cards: readonly BudgetCardView[];
  loading: boolean;
  statusError: string | null;
  catalogError: string | null;
  emptyAction?: { label: string; onClick: () => void };
  renderActions: (card: BudgetCardView) => BudgetCardActions | undefined;
}

function BudgetList({ cards, loading, statusError, catalogError, emptyAction, renderActions }: BudgetListProps): ReactElement {
  if (loading)
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Loading budgets" />
      </div>
    );
  if (statusError && cards.length === 0)
    return (
      <Alert intent="danger" title="Couldn’t load budgets">
        {catalogError ?? statusError}
      </Alert>
    );
  if (cards.length === 0)
    return <EmptyState title="No budgets yet" description="Without a budget, an app’s AI calls are not limited. Add one to cap what an app may spend." action={emptyAction} />;
  return (
    <>
      {statusError ? (
        <Alert intent="warning" title="Live usage couldn’t be loaded" className={styles.notice}>
          The budgets below come from the active catalog. {statusError}
        </Alert>
      ) : null}
      <div className={styles.cards}>
        {cards.map(card => (
          <BudgetCard key={card.index} card={card} actions={renderActions(card)} />
        ))}
      </div>
    </>
  );
}

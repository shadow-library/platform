import { useQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, type ReactElement, useContext, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dialog } from '@shadow-library/ui';

import { type CatalogChange, type CatalogEdit, changeErrorMessage, changeNote, type ChangePreview, type RestorePreview, useCatalogChange } from '@/features/catalog';
import { type IssueNotice, IssueNoticeAlert } from '@/features/shared';
import { type CatalogIssueResponse, credentialsQueryOptions, isCatalogConflict, isForbidden, useCapabilities, useRollbackMutation, type VersionOutcome } from '@/lib';

import {
  ALREADY_LIVE_NOTICE,
  appliedNotice,
  CHANGE_COPY,
  type ChangeResult,
  failedApplyBody,
  restoreCopy,
  restoredTitle,
  type RestoreTarget,
  type ReviewCopy,
  undoNotice,
  type UndoResult,
} from './change-notices';
import { affectedApps, effectSentence, lockedSectionsSentence } from './change-summary';
import { ChangeList } from './ChangeList';
import styles from './Changes.module.css';
import { credentialNamer, nameCredentialChanges } from './credential-names';

export interface ChangeWarning {
  title: string;
  body: string;
}

export interface ConfirmChangeOptions {
  /** A consequence to weigh before applying; it also turns Apply into a danger button */
  warning?: ChangeWarning;
}

export type UndoAction = () => Promise<VersionOutcome>;

export interface AnnouncedChange {
  version: number;
  previous: number;
  changes: CatalogChange[];
  /** Left out to undo by rolling back to `previous` */
  undo?: UndoAction;
}

export interface ChangeFlow {
  confirmChange: (edit: CatalogEdit, options?: ConfirmChangeOptions) => Promise<ChangeResult>;
  confirmRestore: (target: RestoreTarget) => Promise<ChangeResult>;
  announce: (change: AnnouncedChange) => void;
  pending: boolean;
}

type Problem = { kind: 'invalid'; issues: CatalogIssueResponse[] } | { kind: 'failed'; message: string };

type Commit = { kind: 'edit'; edit: CatalogEdit } | { kind: 'restore'; target: RestoreTarget };

interface Review {
  commit: Commit;
  preview: Extract<ChangePreview, { kind: 'ready' }>;
  copy: ReviewCopy;
  warning?: ChangeWarning;
  applying: boolean;
  problem: Problem | null;
}

interface AppliedChange {
  version: number;
  title?: string;
  changes: CatalogChange[];
  undo: UndoAction | null;
}

type Outlet = { kind: 'applied'; change: AppliedChange } | { kind: 'undoing' } | { kind: 'notice'; notice: IssueNotice };

export class ChangeFlowMissingError extends Error {
  constructor() {
    super('useChangeFlow must be used within a ChangeFlowProvider');
    this.name = 'ChangeFlowMissingError';
  }
}

const ChangeFlowContext = createContext<ChangeFlow | null>(null);

export function useChangeFlow(): ChangeFlow {
  const flow = useContext(ChangeFlowContext);
  if (!flow) throw new ChangeFlowMissingError();
  return flow;
}

interface ChangeDialogProps {
  review: Review;
  changes: readonly CatalogChange[];
  locked: string | null;
  onApply: () => void;
  onCancel: () => void;
}

function ChangeDialog({ review, changes, locked, onApply, onCancel }: ChangeDialogProps): ReactElement {
  const { preview, copy, warning, applying, problem } = review;
  const apps = affectedApps(preview.base.version === null ? null : preview.base.document, preview.after, changes);
  return (
    <Dialog open onOpenChange={open => open || onCancel()}>
      <Dialog.Content size="md">
        <Dialog.Header title={copy.title} description={effectSentence(apps)} />
        <Dialog.Body>
          <div className={styles.body}>
            {copy.lead ? <p className={styles.lead}>{copy.lead}</p> : null}
            {warning ? (
              <Alert intent="warning" title={warning.title}>
                {warning.body}
              </Alert>
            ) : null}
            <ChangeList changes={changes} />
            {locked ? (
              <Alert intent="warning" title="Your role can't apply this change">
                {locked}
              </Alert>
            ) : null}
            {problem?.kind === 'invalid' ? (
              <IssueNoticeAlert notice={{ intent: 'danger', title: 'Synapse refused this change', body: 'Nothing was changed. Fix these first:', issues: problem.issues }} />
            ) : null}
            {problem?.kind === 'failed' ? (
              <Alert intent="danger" title="The change may not have been applied">
                {failedApplyBody(problem.message)}
              </Alert>
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            Cancel
          </Button>
          <Button variant={warning ? 'danger' : 'primary'} onClick={onApply} loading={applying} disabled={locked !== null || problem?.kind === 'invalid'}>
            {copy.applyLabel}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

export function ChangeFlowProvider({ children }: PropsWithChildren): ReactElement {
  const changer = useCatalogChange();
  const capabilities = useCapabilities();
  const rollback = useRollbackMutation();
  const [previewing, setPreviewing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const credentials = useQuery({ ...credentialsQueryOptions(), enabled: capabilities.manageCredentials && review !== null });
  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const resolver = useRef<((result: ChangeResult) => void) | null>(null);
  const busy = useRef(false);
  const applying = useRef(false);

  const nameOf = useMemo(() => credentialNamer(credentials.data?.items), [credentials.data]);
  const changes = useMemo(() => {
    if (!review) return [];
    const before = review.preview.base.version === null ? null : review.preview.base.document;
    return nameCredentialChanges(review.preview.changes, before, review.preview.after, nameOf);
  }, [review, nameOf]);

  const rollbackTo =
    (version: number, expectedVersion: number): UndoAction =>
    () =>
      rollback.mutateAsync({ version, expectedVersion });

  const finish = (result: ChangeResult): void => {
    resolver.current?.(result);
    resolver.current = null;
    busy.current = false;
    setReview(null);
  };

  /** Only one change is reviewed at a time; a second request while one is open is treated as cancelled. */
  const startReview = async (load: () => Promise<ChangePreview | RestorePreview>, opened: Pick<Review, 'commit' | 'copy' | 'warning'>): Promise<ChangeResult> => {
    if (busy.current) return { kind: 'cancelled' };
    busy.current = true;
    setOutlet(null);
    setPreviewing(true);
    const preview = await load();
    setPreviewing(false);
    if (preview.kind !== 'ready') {
      busy.current = false;
      return preview;
    }
    return new Promise<ChangeResult>(resolve => {
      resolver.current = resolve;
      setReview({ ...opened, preview, applying: false, problem: null });
    });
  };

  const confirmChange = (edit: CatalogEdit, options: ConfirmChangeOptions = {}): Promise<ChangeResult> =>
    startReview(() => changer.preview(edit), { commit: { kind: 'edit', edit }, copy: CHANGE_COPY, ...(options.warning && { warning: options.warning }) });

  const confirmRestore = (target: RestoreTarget): Promise<ChangeResult> =>
    startReview(() => changer.previewRestore(target.version, target.expectedLive), { commit: { kind: 'restore', target }, copy: restoreCopy(target) });

  const announce = ({ version, previous, changes: announced, undo }: AnnouncedChange): void =>
    setOutlet({ kind: 'applied', change: { version, changes: announced, undo: undo ?? rollbackTo(previous, version) } });

  const cancel = (): void => {
    if (!review || applying.current) return;
    finish(review.problem ?? { kind: 'cancelled' });
  };

  const commit = (current: Review): Promise<ChangeResult> => {
    const { commit: target, preview } = current;
    if (target.kind === 'edit') return changer.apply(target.edit, changeNote(preview.changes), preview.base);
    return changer.restore(target.target.version, preview.after, target.target.expectedLive);
  };

  const apply = async (): Promise<void> => {
    if (!review || applying.current) return;
    applying.current = true;
    setReview({ ...review, applying: true, problem: null });
    const outcome = await commit(review);
    applying.current = false;
    if (outcome.kind === 'invalid' || outcome.kind === 'failed') return setReview({ ...review, applying: false, problem: outcome });
    if (outcome.kind === 'alreadyLive') setOutlet({ kind: 'notice', notice: ALREADY_LIVE_NOTICE });
    if (outcome.kind === 'applied') {
      const title = review.commit.kind === 'restore' ? restoredTitle(review.commit.target, outcome.version) : undefined;
      const undo = outcome.previous === null ? null : rollbackTo(outcome.previous, outcome.version);
      setOutlet({ kind: 'applied', change: { version: outcome.version, changes, undo, ...(title && { title }) } });
    }
    finish(outcome);
  };

  const undo = async ({ version, undo: run }: AppliedChange): Promise<void> => {
    if (!run) return;
    setOutlet({ kind: 'undoing' });
    let result: UndoResult;
    try {
      result = { kind: 'done', outcome: await run(), undone: version };
    } catch (error) {
      if (isCatalogConflict(error)) result = { kind: 'conflict' };
      else if (isForbidden(error)) result = { kind: 'forbidden' };
      else result = { kind: 'failed', message: changeErrorMessage(error) };
    }
    setOutlet({ kind: 'notice', notice: undoNotice(result) });
  };

  const flow: ChangeFlow = { confirmChange, confirmRestore, announce, pending: previewing || (review?.applying ?? false) };

  return (
    <ChangeFlowContext.Provider value={flow}>
      <OutletNotice outlet={outlet} onUndo={change => void undo(change)} onDismiss={() => setOutlet(null)} />
      {children}
      {review ? <ChangeDialog review={review} changes={changes} locked={lockedSectionsSentence(changes, capabilities)} onApply={() => void apply()} onCancel={cancel} /> : null}
    </ChangeFlowContext.Provider>
  );
}

interface OutletNoticeProps {
  outlet: Outlet | null;
  onUndo: (change: AppliedChange) => void;
  onDismiss: () => void;
}

function OutletNotice({ outlet, onUndo, onDismiss }: OutletNoticeProps): ReactElement | null {
  if (!outlet) return null;
  if (outlet.kind === 'undoing') return <Alert intent="info" title="Undoing your change…" className={styles.notice} />;
  if (outlet.kind === 'notice') return <IssueNoticeAlert notice={outlet.notice} onDismiss={onDismiss} className={styles.notice} />;
  const { change } = outlet;
  const notice = appliedNotice(change.version, change.changes, change.title);
  return (
    <Alert
      intent={notice.intent}
      title={notice.title}
      action={change.undo ? { label: 'Undo', onClick: () => onUndo(change) } : undefined}
      onDismiss={onDismiss}
      className={styles.notice}
    >
      {notice.body}
    </Alert>
  );
}

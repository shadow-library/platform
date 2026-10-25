import { useQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, type ReactElement, useContext, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dialog } from '@shadow-library/ui';

import { type CatalogChange, type CatalogEdit, changeErrorMessage, changeNote, type ChangePreview, useCatalogChange } from '@/features/catalog';
import { type IssueNotice, IssueNoticeAlert } from '@/features/shared';
import { type CatalogIssueResponse, credentialsQueryOptions, isCatalogConflict, isForbidden, useCapabilities, useRollbackMutation } from '@/lib';

import { appliedNotice, type ChangeResult, undoNotice, type UndoResult } from './change-notices';
import { affectedApps, type ChangeLine, effectSentence, lockedSectionsSentence, summarizeChanges } from './change-summary';
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

export interface ChangeFlow {
  confirmChange: (edit: CatalogEdit, options?: ConfirmChangeOptions) => Promise<ChangeResult>;
  pending: boolean;
}

type Problem = { kind: 'invalid'; issues: CatalogIssueResponse[] } | { kind: 'failed'; message: string };

interface Review {
  edit: CatalogEdit;
  preview: Extract<ChangePreview, { kind: 'ready' }>;
  warning?: ChangeWarning;
  applying: boolean;
  problem: Problem | null;
}

interface AppliedChange {
  version: number;
  previous: number | null;
  changes: CatalogChange[];
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

function ChangeLineText({ line }: { line: ChangeLine }): ReactElement {
  if (line.kind === 'text') return <>{line.text}</>;
  return (
    <>
      {line.lead}: <span className={styles.before}>{line.before}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <span className="sr-only"> changes to </span>
      <span className={styles.after}>{line.after}</span>
      {line.suffix}
    </>
  );
}

function ChangeList({ changes }: { changes: readonly CatalogChange[] }): ReactElement {
  const groups = summarizeChanges(changes);
  if (groups.length === 0) return <p className={styles.itemLabel}>Technical settings that this console can&apos;t describe in words.</p>;
  return (
    <>
      {groups.map(group => (
        <section key={group.area} aria-label={group.title}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <div className={styles.items}>
            {group.items.map(item => (
              <div key={item.key}>
                <p className={styles.itemLabel}>{item.label}</p>
                <ul className={styles.lines} aria-label={`Changes to ${item.label}`}>
                  {item.lines.map((line, index) => (
                    <li key={index}>
                      <ChangeLineText line={line} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

interface ChangeDialogProps {
  review: Review;
  changes: readonly CatalogChange[];
  locked: string | null;
  onApply: () => void;
  onCancel: () => void;
}

function ChangeDialog({ review, changes, locked, onApply, onCancel }: ChangeDialogProps): ReactElement {
  const { preview, warning, applying, problem } = review;
  const apps = affectedApps(preview.base.version === null ? null : preview.base.document, preview.after, changes);
  return (
    <Dialog open onOpenChange={open => open || onCancel()}>
      <Dialog.Content size="md">
        <Dialog.Header title="Apply this change?" description={effectSentence(apps)} />
        <Dialog.Body>
          <div className={styles.body}>
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
                {problem.message}
              </Alert>
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            Cancel
          </Button>
          <Button variant={warning ? 'danger' : 'primary'} onClick={onApply} loading={applying} disabled={locked !== null || problem?.kind === 'invalid'}>
            Apply
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

  const finish = (result: ChangeResult): void => {
    resolver.current?.(result);
    resolver.current = null;
    busy.current = false;
    setReview(null);
  };

  const confirmChange = async (edit: CatalogEdit, options: ConfirmChangeOptions = {}): Promise<ChangeResult> => {
    if (busy.current) return { kind: 'cancelled' };
    busy.current = true;
    setOutlet(null);
    setPreviewing(true);
    const preview = await changer.preview(edit);
    setPreviewing(false);
    if (preview.kind !== 'ready') {
      busy.current = false;
      return preview;
    }
    return new Promise<ChangeResult>(resolve => {
      resolver.current = resolve;
      setReview({ edit, preview, ...(options.warning && { warning: options.warning }), applying: false, problem: null });
    });
  };

  const cancel = (): void => {
    if (!review || applying.current) return;
    finish(review.problem ?? { kind: 'cancelled' });
  };

  const apply = async (): Promise<void> => {
    if (!review || applying.current) return;
    applying.current = true;
    setReview({ ...review, applying: true, problem: null });
    const outcome = await changer.apply(review.edit, changeNote(review.preview.changes), review.preview.base);
    applying.current = false;
    if (outcome.kind === 'invalid' || outcome.kind === 'failed') return setReview({ ...review, applying: false, problem: outcome });
    if (outcome.kind === 'applied') setOutlet({ kind: 'applied', change: { version: outcome.version, previous: outcome.previous, changes } });
    finish(outcome);
  };

  const undo = async ({ version, previous }: AppliedChange): Promise<void> => {
    if (previous === null) return;
    setOutlet({ kind: 'undoing' });
    let result: UndoResult;
    try {
      result = { kind: 'done', outcome: await rollback.mutateAsync({ version: previous, expectedVersion: version }), undone: version };
    } catch (error) {
      if (isCatalogConflict(error)) result = { kind: 'conflict' };
      else if (isForbidden(error)) result = { kind: 'forbidden' };
      else result = { kind: 'failed', message: changeErrorMessage(error) };
    }
    setOutlet({ kind: 'notice', notice: undoNotice(result) });
  };

  const flow: ChangeFlow = { confirmChange, pending: previewing || (review?.applying ?? false) };

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
  const notice = appliedNotice(change.version, change.changes);
  return (
    <Alert
      intent={notice.intent}
      title={notice.title}
      action={change.previous === null ? undefined : { label: 'Undo', onClick: () => onUndo(change) }}
      onDismiss={onDismiss}
      className={styles.notice}
    >
      {notice.body}
    </Alert>
  );
}

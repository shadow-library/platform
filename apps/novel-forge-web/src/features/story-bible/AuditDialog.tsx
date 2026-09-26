import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Dialog, Spinner, toast } from '@shadow-library/ui';

import { type AuditFindingDecision, type BibleAuditFindingResponse, useAuditReportQuery, useDecideAuditFindingMutation } from '@/lib/apis';
import {
  auditKeptFindingsCount,
  auditProposalLabel,
  auditReadOnly,
  auditRestageable,
  auditStageLabel,
  clearKey,
  findingDecisionValue,
  groupAuditFindings,
  humanizeAuditRef,
} from '@/lib/bible-audit';

import { AuditFindingCard } from './AuditFindingCard';
import styles from './AuditDialog.module.css';

export interface AuditDialogProps {
  novelId: string;
  reportId: string | undefined;
  names: ReadonlyMap<string, string>;
  docTitles: ReadonlyMap<string, string>;
  onOpenChange: (open: boolean) => void;
}

export function AuditDialog({ novelId, reportId, names, docTitles, onOpenChange }: AuditDialogProps): ReactElement {
  const open = Boolean(reportId);
  const report = useAuditReportQuery(novelId, reportId, open);
  const decide = useDecideAuditFindingMutation(novelId);
  const navigate = useNavigate();
  const data = report.data;

  const [optimistic, setOptimistic] = useState<Record<string, AuditFindingDecision>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Reset during render on a report change, the same pattern `ProposalDetail` uses for its own
  // selection — an effect would paint one frame of the previous report's drafts first.
  const [trackedReportId, setTrackedReportId] = useState(reportId);
  if (trackedReportId !== reportId) {
    setTrackedReportId(reportId);
    setOptimistic({});
    setDrafts({});
  }

  const findingById = (findingId: string): BibleAuditFindingResponse | undefined => data?.findings.find(finding => finding.id === findingId);
  const savedReason = (findingId: string): string => findingById(findingId)?.decision?.reason ?? '';
  const reasonFor = (findingId: string): string => drafts[findingId] ?? savedReason(findingId);
  const decisionFor = (findingId: string): AuditFindingDecision => {
    const finding = findingById(findingId);
    return optimistic[findingId] ?? (finding ? findingDecisionValue(finding) : 'kept');
  };

  const submitDecision = (findingId: string, decision: AuditFindingDecision, reason: string | undefined): void => {
    if (!reportId) return;
    setOptimistic(prev => ({ ...prev, [findingId]: decision }));
    decide.mutate(
      { reportId, findingId, body: { decision, reason } },
      {
        onError: err => toast.danger(err.message),
        onSettled: (_data, _error, variables) => {
          setOptimistic(prev => clearKey(prev, variables.findingId));
          setDrafts(prev => clearKey(prev, variables.findingId));
        },
      },
    );
  };

  /** A no-op when the reason didn't change, or when Keep was chosen since the reason was typed — a pending Skip reason must never overwrite a later Keep. */
  const commitReason = (findingId: string): void => {
    const draft = drafts[findingId];
    if (draft === undefined || decisionFor(findingId) !== 'skipped') return;
    if (draft.trim() === savedReason(findingId).trim()) return;
    submitDecision(findingId, 'skipped', draft.trim() || undefined);
  };

  const flushReasons = (): void => {
    for (const findingId of Object.keys(drafts)) commitReason(findingId);
  };

  const closeAnd = (next: boolean): void => {
    if (!next) flushReasons();
    onOpenChange(next);
  };

  const stage = (): void => {
    if (!data?.proposalId) return;
    flushReasons();
    void navigate({ to: '/novels/$novelId/review', params: { novelId }, search: { view: 'proposals', proposal: data.proposalId } });
    onOpenChange(false);
  };

  const readOnly = data ? auditReadOnly(data) : false;
  const restageable = data ? auditRestageable(data) : false;
  const groups = data ? groupAuditFindings(data.findings) : [];
  const keptFindings = data ? auditKeptFindingsCount(data) : 0;

  return (
    <Dialog open={open} onOpenChange={closeAnd}>
      <Dialog.Content size="lg">
        <Dialog.Header title="Story Bible audit" description={data?.checked.copy} showClose={false} />
        <Dialog.Body className={styles.body}>
          {report.isLoading ? (
            <div className={styles.loading}>
              <Spinner size="lg" label="Loading the audit" />
            </div>
          ) : report.error ? (
            <Alert intent="danger" title="Couldn’t load the audit" action={{ label: 'Retry', onClick: () => void report.refetch() }}>
              {report.error.message}
            </Alert>
          ) : data ? (
            <>
              {readOnly && data.proposalStatus && (
                <Alert intent={data.proposalStatus === 'applied' ? 'success' : 'info'} title={`This audit’s card is ${auditProposalLabel(data.proposalStatus).toLowerCase()}`}>
                  Its findings are shown as they were decided — Keep and Skip no longer change anything here.
                </Alert>
              )}
              {restageable && data.proposalStatus && (
                <Alert intent="info" title={`This audit’s card is ${auditProposalLabel(data.proposalStatus).toLowerCase()}`}>
                  Choosing Keep on a finding brings it back as a new pending proposal.
                </Alert>
              )}
              {groups.length === 0 ? (
                <p className={styles.placeholder}>Nothing found — no add, revise, remove or contradiction findings were raised.</p>
              ) : (
                groups.map(group => (
                  <section key={group.group} className={styles.group} aria-label={group.label}>
                    <span className="nf-eyebrow">
                      {group.label} · {group.findings.length}
                    </span>
                    {group.findings.map((finding, index) => (
                      <AuditFindingCard
                        key={finding.id}
                        finding={finding}
                        index={index}
                        humanRef={humanizeAuditRef(finding.ref, names, docTitles)}
                        names={names}
                        docTitles={docTitles}
                        decision={decisionFor(finding.id)}
                        reason={reasonFor(finding.id)}
                        readOnly={readOnly}
                        busy={decide.isPending && decide.variables?.findingId === finding.id}
                        onDecisionChange={decision => submitDecision(finding.id, decision, decision === 'skipped' ? reasonFor(finding.id).trim() || undefined : undefined)}
                        onReasonChange={value => setDrafts(prev => ({ ...prev, [finding.id]: value }))}
                        onReasonCommit={() => commitReason(finding.id)}
                      />
                    ))}
                  </section>
                ))
              )}
            </>
          ) : null}
        </Dialog.Body>
        <Dialog.Footer className={styles.footer}>
          {data?.proposalId && !readOnly && <span className={styles.note}>Kept items become one proposal in the Review Queue — nothing changes until you apply it.</span>}
          <Dialog.Close asChild>
            <Button variant="ghost">Close</Button>
          </Dialog.Close>
          {data?.proposalId && !readOnly && (
            <Button variant="primary" disabled={decide.isPending || keptFindings === 0} onClick={stage}>
              {auditStageLabel(keptFindings)}
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

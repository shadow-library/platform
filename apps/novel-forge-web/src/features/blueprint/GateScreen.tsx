import { type ReactElement } from 'react';
import { Alert, Button, toast } from '@shadow-library/ui';

import { PaneLoader, StatusChip } from '@/components/nf';
import {
  type BlueprintGateResponse,
  type BlueprintPhaseProgressResponse,
  type LedgerEntryResponse,
  useBlueprintGateQuery,
  useLedgerEntriesQuery,
  useOpenWorkspaceMutation,
} from '@/lib/apis';

import styles from './blueprint.module.css';
import { blueprintStepMeta } from './blueprint-steps';
import { DesignSummary } from './DesignSummary';
import { gateHeadline } from './gate';

const READY_LEDE =
  'Everything volume one needs to be written is in place. Everything else is sketched, and gets planned when you reach it — the Blueprint stays one click away from the Workspace.';
const UNREADY_LEDE = 'Read what is settled so far. The Workspace opens once the steps below are decided; nothing here is lost in the meantime.';

export interface GateScreenProps {
  projectId: string;
  title: string;
  phases: BlueprintPhaseProgressResponse[];
  onOpened: () => void;
  onRevisit: (step: string) => void;
  /** Null when the Blueprint offers no step to go back to, which hides the button rather than making it do nothing. */
  onKeepRefining: (() => void) | null;
}

function Unfinished({ gate }: { gate: BlueprintGateResponse }): ReactElement {
  return (
    <Alert intent="warning" title="Not everything is settled yet">
      <ul className={styles.gateIssues}>
        {gate.unfinished.map(gap => (
          <li key={`${gap.phase}-${gap.step}`}>
            {gap.phaseLabel} · {blueprintStepMeta(gap.step).label}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

/**
 * The gate: the whole design on one page, the stop test, and the one button that switches the project into
 * the Workspace. Readiness is checked without a model — it is what the decisions already say.
 */
export function GateScreen({ projectId, title, phases, onOpened, onRevisit, onKeepRefining }: GateScreenProps): ReactElement {
  const gateQuery = useBlueprintGateQuery(projectId);
  const ledgerQuery = useLedgerEntriesQuery(projectId);
  const openWorkspace = useOpenWorkspaceMutation(projectId);

  if (gateQuery.isLoading || ledgerQuery.isLoading) return <PaneLoader />;
  const error = gateQuery.error ?? ledgerQuery.error;
  if (error != null)
    return (
      <Alert intent="danger" title="Couldn’t read the design">
        {error.message}
      </Alert>
    );

  const gate = gateQuery.data;
  const entries: LedgerEntryResponse[] = ledgerQuery.data?.entries ?? [];
  const ready = gate?.ready === true;

  const open = (): void => {
    openWorkspace.mutate(undefined, {
      onSuccess: () => {
        toast.success('The Workspace is open');
        onOpened();
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <header className={styles.gateHero}>
        <span className="nf-eyebrow">{gateHeadline(phases)}</span>
        <h1 className={styles.gateTitle}>{ready ? `${title} is designed` : `${title} is nearly designed`}</h1>
        <p className={styles.phaseLede}>{ready ? READY_LEDE : UNREADY_LEDE}</p>
      </header>

      {gate && !ready && <Unfinished gate={gate} />}

      {gate?.warnings.map(warning => (
        <Alert key={warning.kind} intent="warning" title={warning.title}>
          <p>{warning.detail}</p>
          {warning.steps.length > 0 && <p className={styles.cardLede}>Changed since: {warning.steps.map(key => blueprintStepMeta(key).label).join(', ')}</p>}
          <Button variant="secondary" size="sm" onClick={() => onRevisit(warning.step)}>
            Open {blueprintStepMeta(warning.step).label}
          </Button>
        </Alert>
      ))}

      <DesignSummary phases={phases} entries={entries} onRevisit={onRevisit} />

      <div className={styles.gateActions}>
        <Button variant="primary" loading={openWorkspace.isPending} disabled={!ready || openWorkspace.isPending} onClick={open}>
          Open the Workspace
        </Button>
        {onKeepRefining && (
          <Button variant="ghost" onClick={onKeepRefining}>
            Keep refining
          </Button>
        )}
        {gate?.opened === true && <StatusChip intent="success">Already in the Workspace</StatusChip>}
      </div>
    </>
  );
}

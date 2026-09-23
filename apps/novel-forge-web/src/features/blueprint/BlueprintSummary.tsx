import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { PaneLoader } from '@/components/nf';
import { type BlueprintProgressResponse, useLedgerEntriesQuery } from '@/lib/apis';

import styles from './blueprint.module.css';
import { CoverageLines } from './CoverageLines';
import { DesignSummary } from './DesignSummary';
import { gateHeadline } from './gate';
import { importCoverageSummary } from './import-coverage';

export interface BlueprintSummaryProps {
  projectId: string;
  title: string;
  blueprint: BlueprintProgressResponse;
  onRevisit: (step: string) => void;
}

const IMPORT_LEDE =
  'This plan was imported, so it never went through the Blueprint. What it already settles is read from its own content; every gap but a missing chapter brief is a recommendation.';

/**
 * What the Blueprint is once the Workspace is open: the design as it stands, read-only, with a way back
 * into any phase. Reopening one is an ordinary revisit — the ledger supersedes, nothing is copied back.
 * An import has no ledger to read back, so it gets its coverage instead of seven empty cells.
 */
export function BlueprintSummary({ projectId, title, blueprint, onRevisit }: BlueprintSummaryProps): ReactElement {
  const imported = blueprint.importCoverage;
  const ledgerQuery = useLedgerEntriesQuery(projectId, undefined, imported == null);

  if (ledgerQuery.isLoading) return <PaneLoader />;
  if (ledgerQuery.error != null)
    return (
      <Alert intent="danger" title="Couldn’t read the design">
        {ledgerQuery.error.message}
      </Alert>
    );

  const coverage = imported ? importCoverageSummary(imported) : null;

  return (
    <>
      <header className={styles.phaseHeader}>
        <div className={styles.phaseHeaderMain}>
          <span className="nf-eyebrow">{coverage ? `Blueprint · ${coverage.headline} from the import` : gateHeadline(blueprint.phases)}</span>
          <h1 className={styles.phaseTitle}>{coverage ? `What ${title} already covers` : `How ${title} was designed`}</h1>
          <p className={styles.phaseLede}>
            {coverage
              ? IMPORT_LEDE
              : 'Every decision behind the novel, phase by phase. Reopening a phase changes the design from here on; what is already written stays as it is until you change it.'}
          </p>
        </div>
      </header>

      {coverage ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Blueprint from the import</h2>
          <CoverageLines lines={coverage.lines} />
          <p className={styles.cardLede}>
            {coverage.blocking
              ? 'A chapter needs a brief before it can be generated; everything else here is a recommendation.'
              : 'Nothing here blocks writing. Reopen any phase from the sidebar to settle it properly.'}
          </p>
        </section>
      ) : (
        <DesignSummary phases={blueprint.phases} entries={ledgerQuery.data?.entries ?? []} onRevisit={onRevisit} />
      )}
    </>
  );
}

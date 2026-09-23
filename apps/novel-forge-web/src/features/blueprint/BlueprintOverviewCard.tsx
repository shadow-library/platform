import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button } from '@shadow-library/ui';

import { SectionCard, StatusChip } from '@/components/nf';
import { type BlueprintProgressResponse, useLedgerEntriesQuery } from '@/lib/apis';

import styles from './blueprint.module.css';
import { CoverageLines } from './CoverageLines';
import { importCoverageSummary } from './import-coverage';

const LEDGER_QUERY = { topics: 'theme,ending' };

export interface BlueprintOverviewCardProps {
  novelId: string;
  blueprint: BlueprintProgressResponse;
}

/**
 * The Blueprint as the Workspace sees it. An imported plan never had one, so it gets its coverage read
 * from its content instead: every gap but a missing chapter brief is a recommendation.
 */
export function BlueprintOverviewCard({ novelId, blueprint }: BlueprintOverviewCardProps): ReactElement {
  const navigate = useNavigate();
  const ledgerQuery = useLedgerEntriesQuery(novelId, LEDGER_QUERY, blueprint.importCoverage == null);
  const entries = ledgerQuery.data?.entries ?? [];
  const open = (): void => void navigate({ to: '/novels/$novelId/blueprint', params: { novelId } });

  if (blueprint.importCoverage) {
    const coverage = importCoverageSummary(blueprint.importCoverage);
    return (
      <SectionCard title="Blueprint from the import" action={<StatusChip intent={coverage.blocking ? 'danger' : 'warning'}>{coverage.headline}</StatusChip>}>
        <CoverageLines lines={coverage.lines} />
        <p className={styles.cardLede}>
          {coverage.blocking
            ? 'A chapter needs a brief before it can be generated; everything else here is a recommendation.'
            : 'Every gap here is a recommendation, not a blocker.'}
        </p>
        <Button variant="secondary" size="sm" onClick={open}>
          Open Blueprint
        </Button>
      </SectionCard>
    );
  }

  const phasesDone = blueprint.phases.filter(phase => phase.status === 'done').length;
  const line = (topic: string): string | null => entries.find(entry => entry.topic === topic)?.statement ?? null;
  const theme = line('theme');
  const ending = line('ending');

  return (
    <SectionCard
      title="Blueprint"
      action={<StatusChip intent={phasesDone === blueprint.phases.length ? 'success' : 'info'}>{`${phasesDone} of ${blueprint.phases.length}`}</StatusChip>}
    >
      {theme && <p className={styles.cardLede}>{theme}</p>}
      {ending && <p className={styles.cardLede}>Ending: {ending}</p>}
      <Button variant="secondary" size="sm" onClick={open}>
        Open Blueprint
      </Button>
    </SectionCard>
  );
}

import { type ReactElement, useState } from 'react';
import { Switch, Table, type TableColumn } from '@shadow-library/ui';

import { CostLabel, formatNumber, formatSignedUsd, formatUsd, Mono, Muted, SectionHeader, ShareCell } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { BASIS_NOUNS, type CostBasis, formatPerCall, type UsageChange, type UsageRowView } from './usage-report';
import styles from './Usage.module.css';

interface UsageTableProps {
  rows: UsageRowView[];
  groupLabel: string;
  basis: CostBasis;
  previousFailed: boolean;
  loading: boolean;
}

type TokenField = 'inputTokens' | 'cachedInputTokens' | 'outputTokens' | 'reasoningTokens';

const TOKEN_COLUMNS: readonly { id: TokenField; header: string }[] = [
  { id: 'inputTokens', header: 'Input tokens' },
  { id: 'cachedInputTokens', header: 'Cached input' },
  { id: 'outputTokens', header: 'Output tokens' },
  { id: 'reasoningTokens', header: 'Reasoning tokens' },
];

function Numeric({ children }: { children: string }): ReactElement {
  return <span className={controls.tabular}>{children}</span>;
}

function ChangeCell({ change }: { change: UsageChange }): ReactElement {
  if (change.kind === 'unavailable') return <Muted>—</Muted>;
  if (change.kind === 'new') return <Muted>New</Muted>;
  const tone = change.usd < 0 ? styles.cheaper : change.usd > 0 ? styles.dearer : undefined;
  return <span className={`${controls.tabular} ${tone ?? ''}`}>{formatSignedUsd(change.usd)}</span>;
}

function NameCell({ row }: { row: UsageRowView }): ReactElement {
  if (row.key === null) return <Muted>{row.name}</Muted>;
  return (
    <span className={styles.name}>
      <span>{row.name}</span>
      {row.name === row.key ? null : <Mono>{row.key}</Mono>}
    </span>
  );
}

export function UsageTable({ rows, groupLabel, basis, previousFailed, loading }: UsageTableProps): ReactElement {
  const [showTokens, setShowTokens] = useState(false);
  const basisNoun = BASIS_NOUNS[basis];

  const columns: TableColumn<UsageRowView>[] = [
    { id: 'name', header: groupLabel, cell: row => <NameCell row={row} /> },
    { id: 'billedCostUsd', header: <CostLabel kind="billed" />, align: 'end', cell: row => <Numeric>{formatUsd(row.billedCostUsd)}</Numeric> },
    { id: 'listCostUsd', header: <CostLabel kind="list" />, align: 'end', cell: row => <Numeric>{formatUsd(row.listCostUsd)}</Numeric> },
    { id: 'change', header: `Change in ${basisNoun}`, align: 'end', cell: row => <ChangeCell change={row.change} /> },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <Numeric>{formatNumber(row.calls)}</Numeric> },
    {
      id: 'averageListCost',
      header: 'Avg API-price per call',
      align: 'end',
      cell: row => (row.averageListCost === null ? <Muted>—</Muted> : <Numeric>{formatPerCall(row.averageListCost)}</Numeric>),
    },
    { id: 'share', header: `Share of ${basisNoun}`, align: 'end', cell: row => <ShareCell share={row.share} /> },
    ...(showTokens
      ? TOKEN_COLUMNS.map(({ id, header }): TableColumn<UsageRowView> => ({ id, header, align: 'end', cell: row => <Numeric>{formatNumber(row[id])}</Numeric> }))
      : []),
  ];

  return (
    <section className={styles.section} aria-label={`Usage by ${groupLabel.toLowerCase()}`}>
      <SectionHeader
        title={`By ${groupLabel.toLowerCase()}`}
        subtitle={
          previousFailed ? "Couldn't load the previous period, so changes aren't shown." : `Ordered by ${basisNoun}. Change compares with the previous period of the same length.`
        }
        action={<Switch label="Show tokens" checked={showTokens} onCheckedChange={setShowTokens} />}
      />
      <Table data={rows} columns={columns} rowKey="id" loading={loading} aria-label={`Usage by ${groupLabel.toLowerCase()}`} emptyState="No settled calls in this range." />
    </section>
  );
}

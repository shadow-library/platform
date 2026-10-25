import { type ReactElement } from 'react';
import { Drawer, Table, type TableColumn } from '@shadow-library/ui';

import { type ModelEntry } from '@/features/catalog';
import { modelDisplayName, Mono } from '@/features/shared';

import { compareModels, type ComparisonRow, type UsageIndex } from './model-view';
import styles from './Models.module.css';

export interface ModelCompareProps {
  models: readonly ModelEntry[];
  usage: UsageIndex;
  providerKeys: ReadonlySet<string>;
  onClose: () => void;
}

export function ModelCompare({ models, usage, providerKeys, onClose }: ModelCompareProps): ReactElement {
  const rows = compareModels(models, usage, providerKeys);
  const columns: TableColumn<ComparisonRow>[] = [
    { id: 'label', header: <span className="sr-only">Setting</span>, cell: row => <span className={styles.compareLabel}>{row.label}</span> },
    ...models.map((model, index): TableColumn<ComparisonRow> => ({
      id: `model-${model.key}`,
      header: (
        <span className={styles.stack}>
          <span>{modelDisplayName(model)}</span>
          <Mono>{model.key}</Mono>
        </span>
      ),
      cell: row =>
        row.cheapest[index] ? (
          <span className={styles.cheapest}>
            {row.values[index]}
            <span className={styles.cheapestNote}> · cheapest</span>
          </span>
        ) : (
          row.values[index]
        ),
    })),
  ];

  return (
    <Drawer open onOpenChange={open => open || onClose()} size="lg">
      <Drawer.Header title="Compare models" meta="Prices are list prices per million tokens unless marked per image." />
      <Drawer.Body>
        <Table data={rows} columns={columns} rowKey="id" density="compact" aria-label="Model comparison" />
      </Drawer.Body>
    </Drawer>
  );
}

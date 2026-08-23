import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Badge, Button, Card, Progress, Select, Skeleton } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type ExportFormat, type ExportStage, useAccountCommand, useExportView } from '@/lib/data';

import styles from './settings.module.css';

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'json-csv', label: 'JSON and CSV' },
  { value: 'csv', label: 'CSV only' },
  { value: 'markdown', label: 'Markdown journal' },
];

const STAGE_LABELS: Record<Exclude<ExportStage, 'idle'>, { label: string; intent: 'info' | 'success' | 'warning' }> = {
  preparing: { label: 'Preparing', intent: 'info' },
  ready: { label: 'Ready', intent: 'success' },
  failed: { label: 'Did not finish', intent: 'warning' },
};

export function ExportScreen(): ReactElement {
  const view = useExportView();
  const command = useAccountCommand();
  const [format, setFormat] = useState<ExportFormat>('json-csv');
  const stage = view.data?.job.stage ?? 'idle';

  return (
    <Screen
      title="Data export"
      subtitle="One archive with every record you have created, in formats you can open without this app. Exporting changes nothing and can be done as often as you like."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      {view.isPending || !view.data ? <Skeleton.Card /> : null}

      {view.data ? (
        <ScreenColumns
          aside={
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Previous exports</h2>
              <ul className={styles.deviceRows}>
                {view.data.past.map(entry => (
                  <li key={entry.id} className={styles.deviceRow}>
                    <span>
                      <span className={styles.rowTitle}>{entry.date}</span>
                      <span className={styles.rowMeta}>{entry.expired ? `${entry.meta} · the link has expired` : entry.meta}</span>
                    </span>
                    <Button size="sm" variant="ghost" disabled={entry.expired}>
                      {entry.expired ? 'Expired' : 'Download'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          }
        >
          <Card padding="lg">
            <h2 className={styles.sectionTitle}>Export everything</h2>
            <div className={styles.sets}>
              {view.data.sets.map(set => (
                <div key={set.name} className={styles.set}>
                  <div className={styles.setName}>{set.name}</div>
                  <p className={styles.setMeta}>{set.meta}</p>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <Select value={format} aria-label="Export format" onValueChange={value => setFormat(value as ExportFormat)}>
                {FORMATS.map(option => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select>
              <Button variant="primary" disabled={stage === 'preparing'} onClick={() => command.mutate({ type: 'export.prepare', format })}>
                Prepare the export
              </Button>
              <span className={styles.jobWhen}>Usually under a minute, and you can leave the page.</span>
            </div>
          </Card>

          {stage !== 'idle' ? (
            <Card padding="lg">
              <div className={styles.jobHead}>
                <Badge variant="soft" intent={STAGE_LABELS[stage].intent}>
                  {STAGE_LABELS[stage].label}
                </Badge>
                <span className={styles.jobWhen}>{view.data.job.when}</span>
              </div>
              {view.data.job.progressPercent !== null ? <Progress value={view.data.job.progressPercent} max={100} size="md" label="Export progress" /> : null}
              <p className={screenStyles.cardBody}>{view.data.job.body}</p>
              <div className={styles.actions}>
                {stage === 'ready' ? <Button variant="primary">Download the archive</Button> : null}
                {stage === 'failed' ? (
                  <Button variant="primary" onClick={() => command.mutate({ type: 'export.prepare', format })}>
                    Try again
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => command.mutate({ type: 'export.cancel' })}>
                  {stage === 'preparing' ? 'Stop' : 'Clear'}
                </Button>
              </div>
            </Card>
          ) : null}
        </ScreenColumns>
      ) : null}
    </Screen>
  );
}

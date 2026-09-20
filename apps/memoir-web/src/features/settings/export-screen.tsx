import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, Button, Card, Skeleton, Spinner } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type ExportStage, type ExportView, notifyOutcome, useAccountCommand, useExportView } from '@/lib/data';

import styles from './settings.module.css';

const STAGE_LABELS: Record<Exclude<ExportStage, 'idle'>, { label: string; intent: 'info' | 'success' | 'warning' }> = {
  preparing: { label: 'Preparing', intent: 'info' },
  ready: { label: 'Ready', intent: 'success' },
  failed: { label: 'Did not finish', intent: 'warning' },
};

export function ExportScreen(): ReactElement {
  const view = useExportView();

  return (
    <Screen
      title="Data export"
      subtitle="One archive with every record you have created, in formats you can open without this app. Exporting changes nothing."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      <DataState query={view} skeleton={<Skeleton.Card />}>
        {data => <ExportFlow view={data} />}
      </DataState>
    </Screen>
  );
}

function ExportFlow({ view }: { view: ExportView }): ReactElement {
  const command = useAccountCommand();
  const stage = view.job.stage;
  const preparing = command.isPendingFor({ type: 'export.prepare' });

  const prepare = async (): Promise<void> => {
    const outcome = await command.run({ type: 'export.prepare' });
    notifyOutcome(outcome, { success: '', action: 'prepare the export' });
  };

  const clear = async (): Promise<void> => {
    const outcome = await command.run({ type: 'export.dismiss' });
    notifyOutcome(outcome, { success: '', action: 'clear the export' });
  };

  return (
    <ScreenColumns
      aside={
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>How the link works</h2>
            <p className={screenStyles.cardBody}>
              The archive is assembled on the server and handed back as a link that expires on its own. There is no library of past archives to keep — ask again whenever you want a
              fresh one, within the daily limit.
            </p>
          </Card.Body>
        </Card>
      }
    >
      <Card padding="lg">
        <Card.Body>
          <h2 className={styles.sectionTitle}>Export everything</h2>
          <div className={styles.sets}>
            {view.sets.map(set => (
              <div key={set.name} className={styles.set}>
                <div className={styles.setName}>{set.name}</div>
                <p className={styles.setMeta}>{set.meta}</p>
              </div>
            ))}
          </div>
          {view.notice ? (
            <Alert className={styles.flowAlert} intent="info">
              {view.notice}
            </Alert>
          ) : null}
          {stage === 'idle' ? (
            <div className={styles.actions}>
              <Button variant="primary" loading={preparing} loadingText="Starting…" disabled={preparing} onClick={() => void prepare()}>
                Prepare the export
              </Button>
              <span className={styles.jobWhen}>Usually under a minute, and you can leave the page.</span>
            </div>
          ) : null}
        </Card.Body>
      </Card>

      {stage !== 'idle' ? (
        <Card padding="lg">
          <Card.Body>
            <div className={styles.jobHead}>
              <Badge variant="soft" intent={STAGE_LABELS[stage].intent}>
                {STAGE_LABELS[stage].label}
              </Badge>
              <span className={styles.jobWhen}>{view.job.when}</span>
              {stage === 'preparing' ? <Spinner size="sm" /> : null}
            </div>
            <p className={screenStyles.cardBody}>{view.job.body}</p>
            <div className={styles.actions}>
              {stage === 'ready' && view.job.downloadUrl ? (
                <Button variant="primary" asChild>
                  <a href={view.job.downloadUrl}>Download the archive</a>
                </Button>
              ) : null}
              {stage === 'failed' ? (
                <Button variant="primary" loading={preparing} loadingText="Starting…" disabled={preparing} onClick={() => void prepare()}>
                  Try again
                </Button>
              ) : null}
              {stage !== 'preparing' ? (
                <Button variant="ghost" onClick={() => void clear()}>
                  Clear
                </Button>
              ) : null}
            </div>
          </Card.Body>
        </Card>
      ) : null}
    </ScreenColumns>
  );
}

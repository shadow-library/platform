import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useMemo } from 'react';
import { Alert, Badge, EmptyState, Spinner } from '@shadow-library/ui';

import { type CatalogDocument, readAliases, readModels, readProviders, readTasks, selectorVocabulary, splitTaskKey, type TaskEntry, useActiveCatalog } from '@/features/catalog';
import { LiveVersionHint, Mono, PageHeader, PermissionGate, taskKindName, taskTitle } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { useCapabilities } from '@/lib';

import { AboutSection } from './AboutSection';
import { AliasesSection } from './AliasesSection';
import { DataPolicySection } from './DataPolicySection';
import { EffortSection } from './EffortSection';
import { type FeatureContext } from './feature-detail';
import styles from './Features.module.css';
import { RoutingSection } from './RoutingSection';

const SUBTITLE = 'Which model answers this feature, how much effort it spends, and which model names people may pick.';

export function FeatureDetailScreen({ taskKey }: { taskKey: string }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <FeatureDetail taskKey={taskKey} canEdit={capabilities.writeCatalog} />
    </PermissionGate>
  );
}

function FeatureDetail({ taskKey, canEdit }: { taskKey: string; canEdit: boolean }): ReactElement {
  const navigate = useNavigate();
  const active = useActiveCatalog();
  const parts = splitTaskKey(taskKey);
  const fallbackHeader = <PageHeader title={parts ? taskTitle(parts) : taskKey} subtitle={SUBTITLE} />;

  if (active.status === 'loading')
    return (
      <>
        {fallbackHeader}
        <div className={controls.loading}>
          <Spinner aria-label="Loading the feature" />
        </div>
      </>
    );
  if (active.status === 'error')
    return (
      <>
        {fallbackHeader}
        <Alert intent="danger" title="Couldn't load the catalog">
          {active.error.message}
        </Alert>
      </>
    );

  const task = active.status === 'ready' ? readTasks(active.document).find(candidate => candidate.key === taskKey) : undefined;
  if (active.status === 'none' || !task)
    return (
      <>
        {fallbackHeader}
        <EmptyState
          title="This feature isn't in the catalog"
          description={`The live catalog has no feature called "${taskKey}". New features are added by the app's developers.`}
          action={{ label: 'All features', onClick: () => void navigate({ to: '/features' }) }}
        />
      </>
    );

  return <FeatureSections document={active.document} version={active.version} task={task} canEdit={canEdit} />;
}

interface FeatureSectionsProps {
  document: CatalogDocument;
  version: number;
  task: TaskEntry;
  canEdit: boolean;
}

function FeatureSections({ document, version, task, canEdit }: FeatureSectionsProps): ReactElement {
  const context = useMemo<FeatureContext>(
    () => ({ models: readModels(document), aliases: readAliases(document), providers: readProviders(document), vocabulary: selectorVocabulary(document) }),
    [document],
  );
  const props = { task, document, canEdit };

  return (
    <>
      <PageHeader title={taskTitle(task)} subtitle={task.description ?? SUBTITLE} />
      <div className={styles.meta}>
        <Mono>{task.key}</Mono>
        <Badge variant="outline">{taskKindName(task.kind)}</Badge>
        {task.pinned ? <Badge variant="outline">Pinned</Badge> : null}
      </div>
      <LiveVersionHint version={version} canEdit={canEdit} />
      {canEdit ? null : (
        <Alert intent="info" title="You can view this feature but not change it" className={styles.notice}>
          Changing a feature needs permission to change the catalog. Ask a Synapse administrator if you need it.
        </Alert>
      )}
      <div className={styles.sections}>
        <AboutSection {...props} />
        <RoutingSection {...props} context={context} />
        <EffortSection {...props} />
        <AliasesSection {...props} context={context} />
        <DataPolicySection {...props} context={context} />
      </div>
      <p className={controls.hint}>New features are added, and old ones retired, by the app&apos;s developers.</p>
    </>
  );
}

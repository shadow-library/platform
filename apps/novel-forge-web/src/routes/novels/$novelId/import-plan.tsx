/**
 * Importing npm packages
 */
import { Alert, Button, Dialog, FileUpload, Switch, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PageContainer, PageHeader, QueryState, SectionCard, StatusChip } from '@/components/nf';
import { type CollectionResult, type ImportPlanResponse, type PlanBundle, useImportPlanMutation, useProjectQuery } from '@/lib/apis';

import styles from './import-plan.module.css';

export const Route = createFileRoute('/novels/$novelId/import-plan')({
  component: ImportPlanScreen,
});

/**
 * Declaring the constants
 */

const BUNDLE_FORMAT = 'novel-forge-plan';
const BUNDLE_VERSION = 1;

interface CollectionRow {
  key: keyof ImportPlanResponse['results'];
  label: string;
}

const COLLECTIONS: CollectionRow[] = [
  { key: 'bible', label: 'Bible documents' },
  { key: 'entities', label: 'Entities' },
  { key: 'volumes', label: 'Volumes' },
  { key: 'arcs', label: 'Arcs' },
  { key: 'briefs', label: 'Chapter briefs' },
];

function bundleCount(bundle: PlanBundle, key: CollectionRow['key']): number {
  return bundle[key]?.length ?? 0;
}

function resultChips(counts: CollectionResult): React.JSX.Element {
  return (
    <span className={styles.chipRow}>
      {counts.created > 0 && <StatusChip intent="success">{counts.created} created</StatusChip>}
      {counts.updated > 0 && <StatusChip intent="info">{counts.updated} updated</StatusChip>}
      {counts.unchanged > 0 && <StatusChip intent="neutral">{counts.unchanged} unchanged</StatusChip>}
      {counts.pruned > 0 && <StatusChip intent="danger">{counts.pruned} pruned</StatusChip>}
      {counts.created + counts.updated + counts.unchanged + counts.pruned === 0 && <StatusChip intent="neutral">not in bundle</StatusChip>}
    </span>
  );
}

function ImportPlanScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const projectQuery = useProjectQuery(novelId);
  const importPlan = useImportPlanMutation(novelId);

  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [approve, setApprove] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [result, setResult] = useState<ImportPlanResponse | null>(null);

  const project = projectQuery.data;
  const isNewNovel = project?.kind === 'new_novel';

  const readBundle = async (file: File): Promise<void> => {
    setResult(null);
    importPlan.reset();
    try {
      const parsed = JSON.parse(await file.text()) as PlanBundle;
      if (parsed.format !== BUNDLE_FORMAT || parsed.version !== BUNDLE_VERSION) {
        setBundle(null);
        setParseError(`Not a supported plan bundle — expected format "${BUNDLE_FORMAT}" version ${BUNDLE_VERSION}.`);
        return;
      }
      setBundle(parsed);
      setFileName(file.name);
      setParseError(null);
    } catch {
      setBundle(null);
      setParseError('The selected file is not valid JSON.');
    }
  };

  const doImport = (): void => {
    if (!bundle) return;
    setConfirmOverwrite(false);
    importPlan.mutate(
      { bundle, overwrite, approve },
      {
        onSuccess: response => {
          setResult(response);
          toast.success(response.approval ? 'Plan imported and approved' : 'Plan imported');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const submit = (): void => {
    if (overwrite) setConfirmOverwrite(true);
    else doImport();
  };

  const fieldErrors = importPlan.error?.fields ?? [];

  return (
    <PageContainer>
      <QueryState isLoading={projectQuery.isLoading} error={projectQuery.error} isEmpty={!project} emptyTitle="Project not found">
        <>
          <PageHeader
            title="Import plan"
            subtitle="Load a plan bundle authored offline — bible documents, entities, volumes, arcs, and chapter briefs land in one transactional call."
          />

          {!isNewNovel ? (
            <Alert intent="info" title="Plan import is only for new-novel projects">
              Source projects derive their plan from the source pipeline instead.
            </Alert>
          ) : (
            <>
              <SectionCard title="Bundle">
                <div className={styles.form}>
                  <FileUpload
                    aria-label="Plan bundle file"
                    accept={['.json']}
                    maxFiles={1}
                    onValueChange={files => {
                      const file = files[files.length - 1]?.file;
                      if (file) void readBundle(file);
                    }}
                  />
                  {parseError && (
                    <Alert intent="danger" title="Cannot read this bundle">
                      {parseError}
                    </Alert>
                  )}

                  {bundle && (
                    <div className={styles.preview}>
                      <div className={styles.previewTitle}>{fileName}</div>
                      <div className={styles.previewGrid}>
                        {COLLECTIONS.map(({ key, label }) => (
                          <div key={key} className={styles.previewCell}>
                            <div className={styles.previewCount}>{bundleCount(bundle, key)}</div>
                            <div className={styles.previewLabel}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Switch
                    label="Approve on import"
                    description="Lay out chapter ranges and approve volumes and arcs so chapter generation can start immediately."
                    checked={approve}
                    onCheckedChange={setApprove}
                  />
                  <Switch
                    label="Overwrite existing plan"
                    description="Replace matching items and prune ones missing from the bundle. Without this, importing into a project that already has plan data is rejected."
                    checked={overwrite}
                    onCheckedChange={setOverwrite}
                  />

                  <div>
                    <Button variant="primary" disabled={!bundle} loading={importPlan.isPending} onClick={submit}>
                      Import bundle
                    </Button>
                  </div>
                </div>
              </SectionCard>

              {fieldErrors.length > 0 && (
                <Alert intent="danger" title="The bundle failed validation — fix the workspace and re-pack">
                  <ul className={styles.issueList}>
                    {fieldErrors.map((f, i) => (
                      <li key={i}>
                        <code>{f.field}</code> — {f.msg}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              {result && (
                <SectionCard title="Results">
                  <div className={styles.results}>
                    {COLLECTIONS.map(({ key, label }) => (
                      <div key={key} className={styles.resultRow}>
                        <span className={styles.resultLabel}>{label}</span>
                        {resultChips(result.results[key])}
                      </div>
                    ))}
                    {result.approval && (
                      <div className={styles.resultRow}>
                        <span className={styles.resultLabel}>Approval</span>
                        <span className={styles.chipRow}>
                          <StatusChip intent="success">{result.approval.volumesApproved} volumes approved</StatusChip>
                          <StatusChip intent="success">{result.approval.arcsApproved} arcs approved</StatusChip>
                        </span>
                      </div>
                    )}
                  </div>
                  {result.warnings.length > 0 && (
                    <Alert intent="warning" title="Imported with warnings">
                      <ul className={styles.issueList}>
                        {result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                </SectionCard>
              )}
            </>
          )}
        </>
      </QueryState>

      <Dialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title="Overwrite the existing plan?"
            description="Matching items are replaced and anything missing from the bundle is deleted — including refinements made in the app. This cannot be undone."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={importPlan.isPending} onClick={doImport}>
              Overwrite plan
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </PageContainer>
  );
}

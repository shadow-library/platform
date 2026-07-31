/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, FileUpload, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PageContainer, PageHeader, SectionCard } from '@/components/nf';
import { type NovelBundle, useImportNovelMutation } from '@/lib/apis';

import styles from './import.module.css';

export const Route = createFileRoute('/_app/import')({
  head: () => ({ meta: [{ title: 'Import novel · Novel Forge' }] }),
  component: ImportNovelScreen,
});

/**
 * Declaring the constants
 */

const BUNDLE_FORMAT = 'novel-import';
const BUNDLE_SCHEMA_VERSION = 1;

function chapterCount(bundle: NovelBundle): number {
  return bundle.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
}

function ImportNovelScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const importNovel = useImportNovelMutation();

  const [bundle, setBundle] = useState<NovelBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const readBundle = async (file: File): Promise<void> => {
    importNovel.reset();
    try {
      const parsed = JSON.parse(await file.text()) as NovelBundle;
      if (parsed.format !== BUNDLE_FORMAT || parsed.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
        setBundle(null);
        setParseError(`Not a supported novel-import bundle — expected format "${BUNDLE_FORMAT}" schema version ${BUNDLE_SCHEMA_VERSION}.`);
        return;
      }
      if (!Array.isArray(parsed.volumes) || parsed.volumes.length === 0) {
        setBundle(null);
        setParseError('The bundle has no volumes — at least one volume with one chapter is required.');
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

  const submit = (): void => {
    if (!bundle) return;
    importNovel.mutate(bundle, {
      onSuccess: response => {
        toast.success(`Import started — ${chapterCount(bundle)} chapters queued`);
        navigate({ to: '/novels/$novelId/overview', params: { novelId: response.projectId } });
      },
      onError: err => toast.danger(err.message),
    });
  };

  // `ApiError.fieldErrors` folds the backend's field problems into a `{ field: message }` map for inline display.
  const fieldErrors = Object.entries(importNovel.error?.fieldErrors ?? {});

  return (
    <PageContainer>
      <PageHeader
        title="Import novel"
        subtitle="Load a hand-authored novel-import bundle — the project and its chapters land in one call. Source bundles feed the source pipeline; final bundles land locked and publish-ready."
      />

      <SectionCard title="Bundle">
        <div className={styles.form}>
          <FileUpload
            aria-label="Novel-import bundle file"
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
                <div className={styles.previewCell}>
                  <div className={styles.previewCount}>{bundle.mode}</div>
                  <div className={styles.previewLabel}>Mode</div>
                </div>
                <div className={styles.previewCell}>
                  <div className={styles.previewCount}>{bundle.volumes.length}</div>
                  <div className={styles.previewLabel}>Volumes</div>
                </div>
                <div className={styles.previewCell}>
                  <div className={styles.previewCount}>{chapterCount(bundle)}</div>
                  <div className={styles.previewLabel}>Chapters</div>
                </div>
                <div className={styles.previewCell}>
                  <div className={styles.previewCount}>{bundle.novel.cover ? 'Yes' : 'No'}</div>
                  <div className={styles.previewLabel}>Cover</div>
                </div>
              </div>
              <div className={styles.previewNovel}>
                <span className={styles.previewNovelTitle}>{bundle.novel.title}</span>
                <span className={styles.previewNovelSynopsis}>{bundle.novel.synopsis}</span>
              </div>
            </div>
          )}

          <div>
            <Button variant="primary" disabled={!bundle} loading={importNovel.isPending} onClick={submit}>
              Import novel
            </Button>
          </div>
        </div>
      </SectionCard>

      {fieldErrors.length > 0 && (
        <Alert intent="danger" title="The bundle failed validation">
          <ul className={styles.issueList}>
            {fieldErrors.map(([field, message]) => (
              <li key={field}>
                <code>{field}</code> — {message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </PageContainer>
  );
}

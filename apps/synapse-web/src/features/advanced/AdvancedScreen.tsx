import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Spinner, useConfirm } from '@shadow-library/ui';

import { activeVersionOf, type CatalogDocument, parseCatalog } from '@/features/catalog';
import { isSameValue } from '@/features/catalog/catalog-values';
import { changeResultNotice, useChangeFlow } from '@/features/changes';
import { formatDateTime, type IssueNotice, IssueNoticeAlert, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogIssueResponse, useCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

import styles from './Advanced.module.css';
import { EditorPanel } from './EditorPanel';
import { CATALOG_CHANGED, type EditorSource, editorSourceOf, fetchEditorSource, wholeDocumentEdit } from './editor-source';

export function AdvancedScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <AdvancedView capabilities={capabilities} />
    </PermissionGate>
  );
}

function EngineersBanner(): ReactElement {
  return (
    <Alert intent="info" className={styles.notice}>
      For engineers. Most changes are easier on the <Link to="/features">Features</Link>, <Link to="/models">Models</Link>, <Link to="/aliases">Model names</Link>,{' '}
      <Link to="/budgets">Budgets</Link> and <Link to="/providers">Providers</Link> screens.
    </Alert>
  );
}

function AdvancedView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const versions = useQuery(versionsQueryOptions());
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;
  const activeDetail = useQuery({ ...versionQueryOptions(active?.version ?? 0), enabled: active !== undefined, placeholderData: keepPreviousData });
  const [notice, setNotice] = useState<IssueNotice | null>(null);

  const loadError = versions.error ?? activeDetail.error;
  const ready = versions.data !== undefined && (active === undefined || activeDetail.data !== undefined);

  return (
    <>
      <PageHeader
        title="Advanced editor"
        subtitle={
          active
            ? `Live version ${active.version}, since ${formatDateTime(active.publishedAt)}. Each change goes live as soon as you confirm it.`
            : 'No catalog version is live yet.'
        }
      />
      <EngineersBanner />
      {notice ? <IssueNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      {loadError ? (
        <Alert intent="danger" title="Couldn't load the catalog" className={styles.notice}>
          {loadError.message}
        </Alert>
      ) : null}
      {ready ? (
        <CatalogEditor capabilities={capabilities} initial={editorSourceOf(activeDetail.data ?? null)} onNotice={setNotice} />
      ) : loadError ? null : (
        <div className={controls.loading}>
          <Spinner aria-label="Loading the live catalog" />
        </div>
      )}
    </>
  );
}

interface CatalogEditorProps {
  capabilities: Capabilities;
  initial: EditorSource;
  onNotice: (notice: IssueNotice | null) => void;
}

function CatalogEditor({ capabilities, initial, onNotice }: CatalogEditorProps): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const flow = useChangeFlow();
  const [text, setText] = useState(initial.text);
  const [source, setSource] = useState<EditorSource>(initial);
  const [issues, setIssues] = useState<CatalogIssueResponse[] | null>(null);
  const parsed = parseCatalog(text);
  const dirty = text !== source.text;

  useBlocker({
    shouldBlockFn: async ({ current, next }) =>
      current.pathname !== next.pathname &&
      !(await confirm({
        title: 'Leave with catalog edits not applied?',
        description: 'Your edits to the catalog have not been applied and will be lost.',
        confirmLabel: 'Discard edits',
        intent: 'danger',
      })),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  });

  /** The person's text survives a concurrent change as edits against the version now live, which the next apply is checked against. */
  const rebase = async (): Promise<void> => {
    const next = await fetchEditorSource(queryClient).catch(() => null);
    if (!next) return onNotice({ intent: 'danger', title: 'The catalog changed since you opened it', body: "The live catalog couldn't be loaded; reload the page." });
    setSource(next);
    onNotice({
      intent: 'warning',
      title: 'The catalog changed since you opened it',
      body: 'Nothing was changed. The editor now compares against the live version and keeps your text as edits: Revert loads the live version, Review and apply replaces it with your text.',
    });
  };

  /** The live catalog already matches the text, so the editor now starts from it and the text no longer counts as edits. */
  const adopt = async (sentText: string, document: CatalogDocument): Promise<void> => {
    const next = await fetchEditorSource(queryClient).catch(() => null);
    if (next && isSameValue(next.document, document)) setSource({ ...next, text: sentText });
  };

  const handleApply = async (): Promise<void> => {
    if (!parsed.ok) return;
    const sentText = text;
    const document = parsed.document;
    onNotice(null);
    const result = await flow.confirmChange(wholeDocumentEdit(source, document));
    if (result.kind === 'cancelled') return;
    setIssues(result.kind === 'invalid' ? result.issues : null);
    if (result.kind === 'applied') return setSource({ text: sentText, version: result.version, document });
    if (result.kind === 'alreadyLive') return adopt(sentText, document);
    if (result.kind === 'conflict' || (result.kind === 'refused' && result.reason === CATALOG_CHANGED)) return rebase();
    if (result.kind === 'unchanged') {
      onNotice({ intent: 'info', title: 'Nothing to change', body: 'The text matches the live catalog.' });
      return adopt(sentText, document);
    }
    onNotice(changeResultNotice(result, 'The catalog', 'updated'));
  };

  return (
    <EditorPanel
      capabilities={capabilities}
      text={text}
      parsed={parsed}
      version={source.version}
      dirty={dirty}
      applying={flow.pending}
      issues={issues}
      onTextChange={setText}
      onRevert={() => setText(source.text)}
      onApply={() => void handleApply()}
    />
  );
}

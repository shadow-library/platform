import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Spinner, useConfirm } from '@shadow-library/ui';

import { activeVersionOf, type EditorSource, editorSourceOf, parseCatalog } from '@/features/catalog';
import { type DraftNotice, DraftNoticeAlert, formatDateTime, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogIssueResponse, draftQueryOptions, useCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

import styles from './Advanced.module.css';
import { DraftPanel } from './DraftPanel';
import { fetchEditorSource } from './editor-source';

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
  const draftQuery = useQuery(draftQueryOptions());
  const draft = draftQuery.data ?? null;
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;
  const activeDetail = useQuery({ ...versionQueryOptions(active?.version ?? 0), enabled: active !== undefined });
  const [notice, setNotice] = useState<DraftNotice | null>(null);

  const activeDocument = activeDetail.data?.document ?? null;
  const loadError = versions.error ?? draftQuery.error ?? activeDetail.error;
  const ready = versions.data !== undefined && draftQuery.data !== undefined && (draft !== null || active === undefined || activeDocument !== null);

  return (
    <>
      <PageHeader
        title="Advanced editor"
        subtitle={
          active
            ? `Active version v${active.version}, published ${formatDateTime(active.publishedAt)}. Edits happen in the draft and reach apps only when it is published.`
            : 'No catalog version has been published yet.'
        }
      />
      <EngineersBanner />
      {notice ? <DraftNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      {loadError ? (
        <Alert intent="danger" title="Couldn't load the catalog" className={styles.notice}>
          {loadError.message}
        </Alert>
      ) : null}
      {ready ? (
        <CatalogEditor capabilities={capabilities} initial={editorSourceOf(draft, activeDetail.data ?? null)} onNotice={setNotice} />
      ) : loadError ? null : (
        <div className={controls.loading}>
          <Spinner aria-label="Loading the active catalog" />
        </div>
      )}
    </>
  );
}

interface CatalogEditorProps {
  capabilities: Capabilities;
  initial: EditorSource;
  onNotice: (notice: DraftNotice | null) => void;
}

function CatalogEditor({ capabilities, initial, onNotice }: CatalogEditorProps): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [text, setText] = useState(initial.text);
  const [note, setNote] = useState(initial.note);
  const [source, setSource] = useState<EditorSource>(initial);
  const [issues, setIssues] = useState<CatalogIssueResponse[] | null>(null);
  const parsed = parseCatalog(text);
  const dirty = text !== source.text || note.trim() !== source.note;

  useBlocker({
    shouldBlockFn: async ({ current, next }) =>
      current.pathname !== next.pathname &&
      !(await confirm({
        title: 'Leave with unsaved catalog edits?',
        description: 'Your edits to the draft have not been saved and will be lost.',
        confirmLabel: 'Discard edits',
        intent: 'danger',
      })),
    disabled: !dirty,
    enableBeforeUnload: dirty,
  });

  /** A refused save keeps the operator's text, now read as unsaved edits against the current draft, which the next save is checked against. */
  const rebaseAfterConflict = async (): Promise<void> => {
    const next = await fetchEditorSource(queryClient).catch(() => null);
    if (!next) return onNotice({ intent: 'danger', title: 'The draft changed since you opened it', body: "The current draft couldn't be loaded; reload the page." });
    setSource(next);
    onNotice({
      intent: 'warning',
      title: 'The draft changed since you opened it',
      body: 'Nothing was saved. The editor now compares against the current draft and keeps your text as unsaved edits: Revert loads the current draft, Save replaces it with your text.',
    });
  };

  return (
    <DraftPanel
      capabilities={capabilities}
      text={text}
      note={note}
      parsed={parsed}
      source={source}
      dirty={dirty}
      issues={issues}
      onTextChange={setText}
      onNoteChange={setNote}
      onRevert={() => {
        setText(source.text);
        setNote(source.note);
      }}
      onSaved={(saved, savedIssues) => {
        setSource(saved);
        setIssues(savedIssues);
      }}
      onIssues={setIssues}
      onNotice={onNotice}
      onConflict={rebaseAfterConflict}
    />
  );
}

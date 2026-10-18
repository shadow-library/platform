import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Spinner, Tabs, useConfirm } from '@shadow-library/ui';

import { formatDateTime, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, catalogKeys, draftQueryOptions, useCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { activeVersionOf, type EditorSource, editorSourceOf, parseCatalog } from './catalog-document';
import { type CatalogTab, type IssueReport, type Notice } from './catalog-editor.types';
import styles from './Catalog.module.css';
import { DraftPanel } from './DraftPanel';
import { fetchEditorSource } from './editor-source';
import { PublishPanel } from './PublishPanel';
import { VersionsPanel } from './VersionsPanel';

export function CatalogWorkspace({ tab }: { tab: CatalogTab }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <CatalogScreen tab={tab} capabilities={capabilities} />
    </PermissionGate>
  );
}

function CatalogScreen({ tab, capabilities }: { tab: CatalogTab; capabilities: Capabilities }): ReactElement {
  const queryClient = useQueryClient();
  const versions = useQuery(versionsQueryOptions());
  const draftQuery = useQuery(draftQueryOptions());
  const draft = draftQuery.data ?? null;
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;
  const activeDetail = useQuery({ ...versionQueryOptions(active?.version ?? 0), enabled: active !== undefined });
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const reload = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    setGeneration(current => current + 1);
  };

  const activeDocument = activeDetail.data?.document ?? null;
  const loadError = versions.error ?? draftQuery.error ?? activeDetail.error;
  const ready = versions.data !== undefined && draftQuery.data !== undefined && (draft !== null || active === undefined || activeDocument !== null);

  return (
    <>
      <PageHeader
        title="Model catalog"
        subtitle={
          active
            ? `Active version v${active.version}, published ${formatDateTime(active.publishedAt)}. Edits happen in the draft and reach apps only when it is published.`
            : 'No catalog version has been published yet.'
        }
      />
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
        </Alert>
      ) : null}
      {loadError ? (
        <Alert intent="danger" title="Couldn't load the catalog" className={styles.notice}>
          {loadError.message}
        </Alert>
      ) : null}
      {ready ? (
        <CatalogEditor
          key={generation}
          tab={tab}
          capabilities={capabilities}
          initial={editorSourceOf(draft, activeDocument)}
          activeVersion={active?.version}
          onNotice={setNotice}
          onReload={reload}
        />
      ) : loadError ? null : (
        <div className={controls.loading}>
          <Spinner aria-label="Loading the active catalog" />
        </div>
      )}
    </>
  );
}

interface CatalogEditorProps {
  tab: CatalogTab;
  capabilities: Capabilities;
  initial: EditorSource;
  activeVersion?: number;
  onNotice: (notice: Notice | null) => void;
  onReload: () => Promise<void>;
}

function CatalogEditor({ tab, capabilities, initial, activeVersion, onNotice, onReload }: CatalogEditorProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [text, setText] = useState(initial.text);
  const [note, setNote] = useState(initial.note);
  const [source, setSource] = useState<EditorSource>(initial);
  const [report, setReport] = useState<IssueReport | null>(null);
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

  /**
   * A refused save keeps the operator's text: the editor is reloaded underneath it, so the text now reads as unsaved edits against the
   * current draft, and the next save is checked against that draft instead of the one the text started from.
   */
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

  const changeTab = (value: string): void => void navigate({ to: '/catalog', search: { tab: value as CatalogTab } });

  /** A publish or rollback replaces what the editor was loaded from; unsaved edits are kept rather than thrown away with it. */
  const afterCatalogChange = async (notice: Notice): Promise<void> => {
    onNotice(dirty ? { ...notice, body: `${notice.body ?? ''} Your unsaved edits were kept.`.trim() } : notice);
    if (!dirty) await onReload();
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} className={styles.tabs}>
      <Tabs.List aria-label="Catalog views">
        <Tabs.Tab value="draft">Draft{dirty ? ' (unsaved)' : ''}</Tabs.Tab>
        <Tabs.Tab value="publish">Diff &amp; publish</Tabs.Tab>
        <Tabs.Tab value="versions">Versions</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="draft" className={styles.panel}>
        <DraftPanel
          capabilities={capabilities}
          text={text}
          note={note}
          parsed={parsed}
          source={source}
          dirty={dirty}
          report={report}
          onTextChange={setText}
          onNoteChange={setNote}
          onRevert={() => {
            setText(source.text);
            setNote(source.note);
          }}
          onSaved={(saved, issues) => {
            setSource(saved);
            setReport({ source: 'save', issues });
          }}
          onReport={setReport}
          onNotice={onNotice}
          onConflict={rebaseAfterConflict}
        />
      </Tabs.Panel>
      <Tabs.Panel value="publish" className={styles.panel}>
        <PublishPanel
          capabilities={capabilities}
          fingerprint={source.fingerprint}
          dirty={dirty}
          report={report?.source === 'publish' ? report : null}
          onReport={setReport}
          onNotice={onNotice}
          onPublished={afterCatalogChange}
          onConflict={async () => {
            onNotice({
              intent: 'warning',
              title: 'The draft changed since you loaded it',
              body: 'Someone else saved or published it. The draft has been reloaded; review the diff before publishing again.',
            });
            await onReload();
          }}
        />
      </Tabs.Panel>
      <Tabs.Panel value="versions" className={styles.panel}>
        <VersionsPanel
          capabilities={capabilities}
          activeVersion={activeVersion}
          report={report?.source === 'rollback' ? report : null}
          onReport={setReport}
          onNotice={onNotice}
          onRolledBack={afterCatalogChange}
        />
      </Tabs.Panel>
    </Tabs>
  );
}

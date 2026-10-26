import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, DescriptionList } from '@shadow-library/ui';

import { type CatalogDocument, type WebSearchSpec } from '@/features/catalog';
import { changeResultNotice, useChangeFlow } from '@/features/changes';
import { formatNumber, formatPrice, type IssueNotice, Muted, SectionHeader } from '@/features/shared';
import cells from '@/features/shared/cells.module.css';
import controls from '@/features/shared/controls.module.css';

import { type CredentialList, KeyStatusText, listedCredentials } from './CredentialPicker';
import styles from './Providers.module.css';
import { WebSearchEditor } from './WebSearchEditor';
import { emptyWebSearchForm, removeWebSearchEdit, type WebSearchEditorMode, type WebSearchForm, webSearchFormOf } from './web-search-form';
import { webSearchKeyStatus, webSearchKindName, webSearchState } from './web-search-view';

const TURN_OFF_WARNING = {
  title: 'This turns web search off',
  body: 'A chat that asks for web search then gets it only from a provider with its own. You can set it up again later.',
};

interface EditorState {
  mode: WebSearchEditorMode;
  initial: WebSearchForm;
}

export interface WebSearchSectionProps {
  document: CatalogDocument;
  editable: boolean;
  credentials: CredentialList;
  onNotice: (notice: IssueNotice | null) => void;
}

function Count({ value }: { value: number | undefined }): ReactElement {
  return value === undefined ? <Muted>Not set</Muted> : <>{formatNumber(value)}</>;
}

function WebSearchDetails({ search, credentials }: { search: WebSearchSpec; credentials: CredentialList }): ReactElement {
  return (
    <Card padding="md">
      <Card.Body>
        <DescriptionList>
          <DescriptionList.Item term="Search engine">{webSearchKindName(search.kind)}</DescriptionList.Item>
          <DescriptionList.Item term="Address">
            <span className={cells.url}>{search.url || 'No address'}</span>
          </DescriptionList.Item>
          <DescriptionList.Item term="API key">
            <KeyStatusText status={webSearchKeyStatus(search, listedCredentials(credentials))} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Searches per answer">
            <Count value={search.maxSearches} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Results per search">
            <Count value={search.results} />
          </DescriptionList.Item>
          <DescriptionList.Item term="Price per search">
            {search.pricePerSearchUsd === undefined ? <Muted>Not added to call prices</Muted> : formatPrice(search.pricePerSearchUsd)}
          </DescriptionList.Item>
        </DescriptionList>
      </Card.Body>
    </Card>
  );
}

export function WebSearchSection({ document, editable, credentials, onNotice }: WebSearchSectionProps): ReactElement {
  const flow = useChangeFlow();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const state = webSearchState(document);

  const turnOff = async (): Promise<void> => {
    onNotice(null);
    setTurningOff(true);
    const outcome = await flow.confirmChange(removeWebSearchEdit(), { warning: TURN_OFF_WARNING });
    setTurningOff(false);
    onNotice(changeResultNotice(outcome, 'Web search', 'removed'));
  };

  const handleSaved = (notice: IssueNotice | null): void => {
    setEditor(null);
    onNotice(notice);
  };

  const actions = (): ReactElement | undefined => {
    if (!editable || state.kind === 'unreadable') return undefined;
    if (state.kind === 'off')
      return (
        <Button variant="secondary" size="sm" disabled={flow.pending} onClick={() => setEditor({ mode: 'add', initial: emptyWebSearchForm() })}>
          Set up web search
        </Button>
      );
    return (
      <span className={styles.inline}>
        <Button
          variant="secondary"
          size="sm"
          disabled={flow.pending}
          onClick={() => setEditor({ mode: 'edit', initial: webSearchFormOf(state.search) })}
          aria-label="Edit web search"
        >
          Edit
        </Button>
        <Button variant="ghost" size="sm" disabled={flow.pending && !turningOff} loading={turningOff && flow.pending} onClick={() => void turnOff()}>
          Turn off
        </Button>
      </span>
    );
  };

  return (
    <section className={styles.section} aria-label="Web search">
      <SectionHeader
        title="Web search"
        subtitle="The search Synapse runs itself for a chat that asks for web search and is served by a model without its own."
        action={actions()}
      />
      {state.kind === 'on' ? <WebSearchDetails search={state.search} credentials={credentials} /> : null}
      {state.kind === 'off' ? <p className={controls.hint}>Off. A chat that asks for web search gets it only from a provider with its own.</p> : null}
      {state.kind === 'unreadable' ? (
        <Alert intent="warning" title="Web search couldn't be read">
          Its settings are malformed, so they aren’t shown. Fix them in the <Link to="/advanced">Advanced editor</Link>.
        </Alert>
      ) : null}
      {editor ? <WebSearchEditor mode={editor.mode} initial={editor.initial} credentials={credentials} onClose={() => setEditor(null)} onSaved={handleSaved} /> : null}
    </section>
  );
}

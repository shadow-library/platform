import { type ReactElement, useId } from 'react';
import { Alert, Button, Card, Textarea } from '@shadow-library/ui';

import { formatCatalog, type ParsedCatalog } from '@/features/catalog';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogIssueResponse } from '@/lib';

import styles from './Advanced.module.css';
import { IssueList } from './IssueList';

interface EditorPanelProps {
  capabilities: Capabilities;
  text: string;
  parsed: ParsedCatalog;
  version: number | null;
  dirty: boolean;
  applying: boolean;
  issues: readonly CatalogIssueResponse[] | null;
  onTextChange: (text: string) => void;
  onRevert: () => void;
  onApply: () => void;
}

function sectionHint(capabilities: Capabilities): string | null {
  const locked = [!capabilities.writeProviders && '`providers`', !capabilities.setBudgets && '`budgets`'].filter(Boolean);
  if (locked.length === 0) return null;
  return `Your role cannot change ${locked.join(' or ')}: a change to them is refused.`;
}

export function EditorPanel({ capabilities, text, parsed, version, dirty, applying, issues, onTextChange, onRevert, onApply }: EditorPanelProps): ReactElement {
  const errorId = useId();
  const readOnly = !capabilities.writeCatalog;
  const hint = readOnly ? 'Your role can read the catalog but not change it.' : sectionHint(capabilities);

  const handleFormat = (): void => {
    if (parsed.ok) onTextChange(formatCatalog(parsed.document));
  };

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.status}>
          <span>{version === null ? 'No version is live yet: the editor starts from an empty catalog.' : `Editing live version ${version}.`}</span>
          {dirty ? <strong>Edits not applied yet</strong> : null}
        </div>
        <Textarea
          mono
          wrap="off"
          value={text}
          onValueChange={onTextChange}
          autoGrow={false}
          minRows={28}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          readOnly={readOnly}
          invalid={!parsed.ok}
          aria-label="Catalog document (JSON)"
          aria-describedby={parsed.ok ? undefined : errorId}
        />
        {parsed.ok ? null : (
          <p id={errorId} className={controls.hint} role="alert">
            Not valid: {parsed.error}
          </p>
        )}
        {hint ? <p className={controls.hint}>{hint}</p> : null}
        {readOnly ? null : (
          <div className={styles.toolbar}>
            <span className={styles.spacer} />
            <Button variant="ghost" onClick={handleFormat} disabled={!parsed.ok}>
              Format
            </Button>
            <Button variant="ghost" onClick={onRevert} disabled={!dirty}>
              Revert
            </Button>
            <Button variant="primary" onClick={onApply} loading={applying} disabled={!parsed.ok || !dirty}>
              Review and apply
            </Button>
          </div>
        )}
        {issues && issues.length > 0 ? (
          <Alert intent="warning" title={`Synapse refused the change: ${issues.length === 1 ? '1 issue' : `${issues.length} issues`}`} className={styles.confirm}>
            Each issue shows the path in the document where it was found.
          </Alert>
        ) : null}
        {issues ? <IssueList issues={issues} label="Issues in the refused change" /> : null}
      </Card.Body>
    </Card>
  );
}

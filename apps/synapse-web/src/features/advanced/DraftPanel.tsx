import { useQueryClient } from '@tanstack/react-query';
import { type ReactElement, useId } from 'react';
import { Alert, Button, Card, FormField, Input, Textarea } from '@shadow-library/ui';

import { draftExpectation, type EditorSource, formatCatalog, NOTE_MAX_LENGTH, type ParsedCatalog } from '@/features/catalog';
import { type DraftNotice } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, type CatalogIssueResponse, catalogKeys, isApiError, isCatalogConflict, useSaveDraftMutation, useValidateDraftMutation } from '@/lib';

import styles from './Advanced.module.css';
import { validationOutcomeOf } from './draft-validation';
import { IssueList } from './IssueList';

interface DraftPanelProps {
  capabilities: Capabilities;
  text: string;
  note: string;
  parsed: ParsedCatalog;
  source: EditorSource;
  dirty: boolean;
  issues: readonly CatalogIssueResponse[] | null;
  onTextChange: (text: string) => void;
  onNoteChange: (note: string) => void;
  onRevert: () => void;
  onSaved: (saved: EditorSource, issues: CatalogIssueResponse[]) => void;
  onIssues: (issues: CatalogIssueResponse[]) => void;
  onNotice: (notice: DraftNotice | null) => void;
  onConflict: () => Promise<void>;
}

function errorNotice(title: string, error: unknown): DraftNotice {
  return { intent: 'danger', title, body: isApiError(error) || error instanceof Error ? error.message : undefined };
}

function sectionHint(capabilities: Capabilities): string | null {
  const locked = [!capabilities.writeProviders && '`providers`', !capabilities.setBudgets && '`budgets`'].filter(Boolean);
  if (locked.length === 0) return null;
  return `Your role cannot change ${locked.join(' or ')}: a save that changes them is refused.`;
}

export function DraftPanel({
  capabilities,
  text,
  note,
  parsed,
  source,
  dirty,
  issues,
  onTextChange,
  onNoteChange,
  onRevert,
  onSaved,
  onIssues,
  onNotice,
  onConflict,
}: DraftPanelProps): ReactElement {
  const errorId = useId();
  const save = useSaveDraftMutation();
  const validate = useValidateDraftMutation();
  const queryClient = useQueryClient();
  const readOnly = !capabilities.writeDraft;
  const hasDraft = source.fingerprint !== null;

  const handleSave = (): void => {
    if (!parsed.ok) return;
    const sentText = text;
    const trimmed = note.trim();
    onNotice(null);
    save.mutate(
      { document: parsed.document, ...(trimmed && { note: trimmed }), ...draftExpectation(source.fingerprint, source.activeVersion) },
      {
        onSuccess: outcome => {
          if (outcome.kind === 'invalid') {
            onIssues(outcome.issues);
            onNotice({ intent: 'danger', title: 'The draft was not saved', body: 'The document was refused; the issues are listed under the editor.' });
            return;
          }
          onSaved({ text: sentText, note: trimmed, fingerprint: outcome.value.fingerprint }, outcome.value.issues);
          onNotice(
            outcome.value.issues.length === 0
              ? { intent: 'success', title: 'Draft saved', body: 'It passes validation. Review the changes and publish them when ready.', changesLink: true }
              : {
                  intent: 'warning',
                  title: 'Draft saved with issues',
                  body: `${outcome.value.issues.length} issue(s) would block publishing; they are listed under the editor.`,
                  changesLink: true,
                },
          );
        },
        onError: error => {
          if (isCatalogConflict(error)) return void onConflict();
          onNotice(errorNotice("Couldn't save the draft", error));
        },
      },
    );
  };

  const handleValidate = (): void => {
    onNotice(null);
    validate.mutate(undefined, {
      onSuccess: result => {
        const outcome = validationOutcomeOf(result);
        if (outcome.kind === 'absent') void queryClient.invalidateQueries({ queryKey: catalogKeys.draft() });
        else onIssues(outcome.issues);
        onNotice(outcome.notice);
      },
      onError: error => onNotice(errorNotice("Couldn't validate the draft", error)),
    });
  };

  const handleFormat = (): void => {
    if (parsed.ok) onTextChange(formatCatalog(parsed.document));
  };

  const hint = capabilities.writeDraft ? sectionHint(capabilities) : 'Your role can read the catalog but not edit it.';

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.status}>
          <span>{hasDraft ? 'Editing the saved draft.' : 'No draft exists: the editor starts from the active version, and saving creates the draft.'}</span>
          {dirty ? <strong>Unsaved edits</strong> : null}
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
          aria-label="Catalog draft document (JSON)"
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
            <FormField label="Note" optional className={styles.note}>
              <Input value={note} onValueChange={onNoteChange} maxLength={NOTE_MAX_LENGTH} placeholder="What this change is for" />
            </FormField>
            <span className={styles.spacer} />
            <Button variant="ghost" onClick={handleFormat} disabled={!parsed.ok}>
              Format
            </Button>
            <Button variant="ghost" onClick={onRevert} disabled={!dirty}>
              Revert
            </Button>
            <Button
              variant="secondary"
              onClick={handleValidate}
              loading={validate.isPending}
              disabled={!hasDraft || dirty}
              title={dirty ? 'Save first: validation checks the saved draft' : undefined}
            >
              Validate
            </Button>
            <Button variant="primary" onClick={handleSave} loading={save.isPending} disabled={!parsed.ok || (hasDraft && !dirty)}>
              Save draft
            </Button>
          </div>
        )}
        {issues && issues.length > 0 ? (
          <Alert intent="warning" title={`${issues.length} issue(s) block publishing`} className={styles.confirm}>
            Each issue shows the path in the document where it was found.
          </Alert>
        ) : null}
        {issues ? <IssueList issues={issues} label="Issues in the saved draft" /> : null}
      </Card.Body>
    </Card>
  );
}

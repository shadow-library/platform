import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useState } from 'react';
import { Alert, Button, Card, Drawer } from '@shadow-library/ui';

import { type CatalogDocument, type CatalogEdit, useDraftEdit } from '@/features/catalog';
import { Mono, SectionHeader } from '@/features/shared';

import { type SaveFeedback, saveFeedback } from './feature-detail';
import styles from './Features.module.css';
import { type FeatureSection, guardedTaskEdit, rawTaskFields, SECTION_FIELDS, type TaskFields } from './section-edits';

export interface SectionEditor {
  open: boolean;
  /** Changes on every opening, so a form keyed by it starts again from the values on screen */
  session: number;
  /** The section's raw fields when the editor opened; a save applies only while the draft still holds them */
  opened: TaskFields;
  saving: boolean;
  feedback: SaveFeedback | null;
  start: () => void;
  cancel: () => void;
  save: (edit: CatalogEdit, note: string) => Promise<void>;
}

export function useSectionEditor(taskKey: string, document: CatalogDocument, section: FeatureSection): SectionEditor {
  const editor = useDraftEdit();
  const fields = SECTION_FIELDS[section];
  const [editing, setEditing] = useState(() => ({ open: false, session: 0, opened: rawTaskFields(document, taskKey, fields) }));
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const close = (): void => setEditing(current => ({ ...current, open: false }));
  return {
    ...editing,
    saving: editor.pending,
    feedback,
    start: () => {
      setFeedback(null);
      setEditing(current => ({ open: true, session: current.session + 1, opened: rawTaskFields(document, taskKey, fields) }));
    },
    cancel: () => {
      setFeedback(null);
      close();
    },
    save: async (edit, note) => {
      setFeedback(null);
      const next = saveFeedback(await editor.apply(guardedTaskEdit(taskKey, fields, editing.opened, edit), note), taskKey, document);
      setFeedback(next);
      if (!next.keepEditing) close();
    },
  };
}

export function FeedbackAlert({ feedback }: { feedback: SaveFeedback }): ReactElement {
  return (
    <Alert intent={feedback.intent} title={feedback.title} className={styles.feedback}>
      {feedback.body}
      {feedback.review ? (
        <>
          {' '}
          <Link to="/changes">Review and publish</Link>
        </>
      ) : null}
      {feedback.issues.length > 0 ? (
        <>
          <ul className={styles.issueList}>
            {feedback.issues.map((issue, index) => (
              <li key={`${issue.path}:${index}`}>{issue.sentence}</li>
            ))}
          </ul>
          <details className={styles.technical}>
            <summary>Technical details</summary>
            <ul className={styles.issueList}>
              {feedback.issues.map((issue, index) => (
                <li key={`${issue.path}:${index}`}>
                  <Mono>{issue.path || '(whole catalog)'}</Mono>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </Alert>
  );
}

export interface SectionCardProps {
  title: string;
  subtitle?: ReactNode;
  editor: SectionEditor;
  editLabel?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, editor, editLabel, children }: SectionCardProps): ReactElement {
  return (
    <Card padding="md" className={styles.section}>
      <Card.Body>
        <SectionHeader
          title={title}
          subtitle={subtitle}
          action={
            editLabel ? (
              <Button variant="secondary" size="sm" onClick={editor.start} aria-label={editLabel}>
                Edit
              </Button>
            ) : undefined
          }
        />
        {children}
        {editor.feedback && !editor.open ? <FeedbackAlert feedback={editor.feedback} /> : null}
      </Card.Body>
    </Card>
  );
}

export interface EditorDrawerProps {
  title: string;
  meta?: ReactNode;
  editor: SectionEditor;
  /** Blocks Save while the form has problems the server would refuse anyway */
  canSave: boolean;
  onSave: () => void;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function EditorDrawer({ title, meta, editor, canSave, onSave, size = 'md', children }: EditorDrawerProps): ReactElement {
  return (
    <Drawer open={editor.open} onOpenChange={open => (open ? undefined : editor.cancel())} size={size}>
      <Drawer.Header title={title} meta={meta} />
      <Drawer.Body>
        <div className={styles.form}>
          {children}
          {editor.feedback && editor.open ? <FeedbackAlert feedback={editor.feedback} /> : null}
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        <Button variant="ghost" onClick={editor.cancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} loading={editor.saving} disabled={!canSave}>
          Save to draft
        </Button>
      </Drawer.Footer>
    </Drawer>
  );
}

import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';

import { Button, IconButton, toast, Tooltip } from '@shadow-library/ui';

import { ChevronLeftIcon, EyeIcon, TrashIcon } from '@/components/icons';
import { RowAction, StatusChip } from '@/components/nf';
import { type EntityResponse, type FactResponse, useRetractKnowledgeMutation } from '@/lib/apis';
import { type BibleSearch } from '@/lib/bible-search';
import { isSecret, revealTimeline, type SecretGroups, secretTitle } from '@/lib/bible-secrets';
import { factAttachments } from '@/lib/canon-facts';

import { RevealDialog } from './BibleDialogs';
import { KindIcon, ListHead, SecretRow } from './EntryList';
import { RevealChip, TermChips, writerNoteText } from './SecretCard';
import styles from './StoryBible.module.css';

export interface SecretsListProps {
  novelId: string;
  groups: SecretGroups<FactResponse>;
  names: ReadonlyMap<string, string>;
  selectedKey: string | undefined;
  searchFor: (fact: FactResponse) => BibleSearch;
}

export function SecretsList({ novelId, groups, names, selectedKey, searchFor }: SecretsListProps): ReactElement {
  const all = useMemo(() => [...groups.planned, ...groups.unplanned], [groups]);
  const timeline = useMemo(() => revealTimeline(all), [all]);
  const byKey = useMemo(() => new Map(all.map(fact => [fact.factKey, fact])), [all]);
  const subjectNames = (fact: FactResponse): string[] => (fact.subjects ?? []).map(key => names.get(key) ?? key);
  const sections = [
    { key: 'planned', label: 'Reveals ahead', facts: groups.planned },
    { key: 'unplanned', label: 'No reveal planned', facts: groups.unplanned },
  ].filter(section => section.facts.length > 0);

  return (
    <>
      <ListHead title="Secrets" description="Every secret lives on the record it is about. This view lines them up by reveal chapter." />
      {timeline.marks.length > 0 && (
        <div className={styles.timeline} role="group" aria-label="Reveal timeline">
          <span className={styles.timelineTrack} aria-hidden="true" />
          {timeline.marks.map(mark => {
            const first = byKey.get(mark.factKeys[0] ?? '');
            const titles = mark.factKeys.map(secretTitle).join(', ');
            return (
              first && (
                <Link
                  key={mark.chapter}
                  to="/novels/$novelId/story-bible"
                  params={{ novelId }}
                  search={searchFor(first)}
                  className={styles.timelineMark}
                  style={{ left: `${mark.position}%` }}
                  aria-label={`Chapter ${mark.chapter}: ${titles}`}
                  title={`ch ${mark.chapter} · ${titles}`}
                  aria-current={selectedKey !== undefined && mark.factKeys.includes(selectedKey) ? 'true' : undefined}
                />
              )
            );
          })}
          <span className={styles.timelineEnds} aria-hidden="true">
            <span>ch 1</span>
            <span>ch {timeline.last}</span>
          </span>
        </div>
      )}
      {sections.length === 0 ? (
        <p className={styles.listEmpty}>No secrets yet. Add one from the record it is about.</p>
      ) : (
        sections.map(section => (
          <section key={section.key} aria-label={section.label}>
            <h3 className={styles.groupHead}>
              {section.label} · {section.facts.length}
            </h3>
            <ul className={styles.rows}>
              {section.facts.map(fact => (
                <SecretRow key={fact.factKey} novelId={novelId} fact={fact} subjectNames={subjectNames(fact)} search={searchFor(fact)} selected={fact.factKey === selectedKey} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

export interface SecretDetailProps {
  novelId: string;
  fact: FactResponse;
  entities: EntityResponse[];
  names: ReadonlyMap<string, string>;
  backSearch: BibleSearch;
  onEdit: (fact: FactResponse) => void;
  onDelete: (fact: FactResponse) => void;
}

function statusText(fact: FactResponse): string {
  if (!isSecret(fact))
    return `Known — ${fact.knowledge.length === 1 ? 'one character has' : `${fact.knowledge.length} characters have`} learned it, so the writer sees it from then on.`;
  const note = (fact.writerNote ?? '').trim() ? 'only the note above' : 'nothing of it';
  return fact.revealChapter != null
    ? `Locked. The writer sees ${note} until chapter ${fact.revealChapter} is drafted.`
    : `Locked. The writer sees ${note}, and no reveal is planned.`;
}

export function SecretDetail({ novelId, fact, entities, names, backSearch, onEdit, onDelete }: SecretDetailProps): ReactElement {
  const retract = useRetractKnowledgeMutation(novelId, fact.factKey);
  const [revealing, setRevealing] = useState(false);
  const title = secretTitle(fact.factKey);
  const attachments = useMemo(() => factAttachments(fact, names), [fact, names]);
  const until = fact.revealChapter != null ? ` until ch ${fact.revealChapter}` : '';
  const terms = fact.terms ?? [];

  const doRetract = (entityKey: string, entityName: string): void =>
    retract.mutate(entityKey, {
      onSuccess: () => toast.success(`Retracted ${entityName}’s knowledge of “${title}”`),
      onError: err => toast.danger(err.message),
    });

  return (
    <section className={styles.pane} aria-label={title}>
      <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={backSearch} className={styles.paneBack}>
        <ChevronLeftIcon size={14} /> Back to secrets
      </Link>

      <header className={styles.paneHeader}>
        <KindIcon kind="secret" large />
        <div className={styles.paneIdentity}>
          <h2 className={styles.paneTitle}>{title}</h2>
          <div className={styles.paneChips}>
            {isSecret(fact) ? <RevealChip fact={fact} /> : <StatusChip intent="success">Known</StatusChip>}
            <span className={styles.muted}>On</span>
            {attachments.length === 0 && <span className={styles.muted}>no record yet</span>}
            {attachments.map(attachment =>
              attachment.kind === 'linked' ? (
                <Link key={attachment.entityKey} to="/novels/$novelId/story-bible" params={{ novelId }} search={{ entity: attachment.entityKey }} className={styles.chipLink}>
                  {attachment.name}
                </Link>
              ) : (
                <StatusChip key={attachment.entityKey} intent="danger">
                  {attachment.entityKey} · missing
                </StatusChip>
              ),
            )}
          </div>
        </div>
        <div className={styles.paneActions}>
          <Button variant="secondary" size="sm" onClick={() => onEdit(fact)}>
            Edit
          </Button>
          <Tooltip content={`Delete ${title}`}>
            <IconButton variant="ghost" size="sm" aria-label={`Delete ${title}`} icon={<TrashIcon size={15} />} onClick={() => onDelete(fact)} />
          </Tooltip>
        </div>
      </header>

      <div className={styles.truthBox}>
        <p className={styles.label}>The truth · only you see this</p>
        <p className={styles.secretText}>{fact.text}</p>
      </div>

      <div className={styles.writerBox}>
        <p className={styles.label}>What the writer is told{until}</p>
        <p className={styles.secretText}>{writerNoteText(fact)}</p>
      </div>

      {fact.constraintNote?.trim() && (
        <div className={styles.col}>
          <p className={styles.label}>Author note</p>
          <p className={styles.secretText}>{fact.constraintNote}</p>
        </div>
      )}

      <div className={styles.col}>
        <p className={styles.label}>{fact.revealChapter != null ? `Never named before ch ${fact.revealChapter}` : 'Never named early'}</p>
        {terms.length === 0 ? (
          <p className={styles.muted}>No guarded words yet.</p>
        ) : (
          <div className={styles.terms}>
            <TermChips terms={terms} />
          </div>
        )}
        <p className={styles.muted}>Plans and chapters that use these words early are cleaned or flagged automatically.</p>
      </div>

      <div className={styles.twoCol}>
        <section className={styles.col} aria-label="Who learns it">
          <h3 className={styles.label}>Who learns it</h3>
          {fact.knowledge.length === 0 ? (
            <p className={styles.muted}>Nobody yet. Add who learns it, and in which chapter, as the story is written.</p>
          ) : (
            <ul className={styles.ledger}>
              {fact.knowledge.map(entry => (
                <li key={entry.entityKey} className={styles.ledgerRow}>
                  <span>
                    <b>{entry.entityName}</b> · ch {entry.learnedInChapter}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </span>
                  <RowAction label={`Retract ${entry.entityName}’s knowledge`} danger onClick={() => doRetract(entry.entityKey, entry.entityName)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" prefix={<EyeIcon size={14} />} onClick={() => setRevealing(true)} className={styles.startAligned}>
            Add who learns it
          </Button>
        </section>
        <section className={styles.col} aria-label="Status">
          <h3 className={styles.label}>Status</h3>
          <p className={styles.muted}>{statusText(fact)}</p>
        </section>
      </div>

      {revealing && (
        <RevealDialog
          novelId={novelId}
          factKey={fact.factKey}
          entities={entities}
          defaultEntityKey={(fact.subjects ?? []).find(key => names.has(key))}
          onOpenChange={setRevealing}
        />
      )}
    </section>
  );
}

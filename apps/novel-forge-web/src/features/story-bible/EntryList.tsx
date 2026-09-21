import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';

import { Button, SegmentedControl } from '@shadow-library/ui';

import { BoltIcon, ConceptIcon, DocIcon, FlagIcon, GemIcon, LockIcon, PersonIcon, PinIcon } from '@/components/icons';
import { StatusChip } from '@/components/nf';
import { type EntityType, type FactResponse } from '@/lib/apis';
import { emptyPlaceholdersLabel } from '@/lib/bible-documents';
import { type BibleEntry, ENTRY_KIND_FILTERS, type EntryGroup, type EntryKindFilter, entryMeta } from '@/lib/bible-entries';
import { type BibleSearch } from '@/lib/bible-search';
import { secretCountLabel, secretRevealLabel, secretTitle, subjectsLabel } from '@/lib/bible-secrets';
import { type BibleTopic, TOPIC_DESCRIPTION, TOPIC_LABEL } from '@/lib/bible-topics';

import styles from './StoryBible.module.css';

const TYPE_ICON: Record<EntityType, (props: { size?: number }) => ReactElement> = {
  character: PersonIcon,
  faction: FlagIcon,
  location: PinIcon,
  power_rule: BoltIcon,
  item: GemIcon,
  concept: ConceptIcon,
};

export type KindIconKind = EntityType | 'guide' | 'secret';

interface KindIconProps {
  kind: KindIconKind;
  large?: boolean;
}

export function KindIcon({ kind, large }: KindIconProps): ReactElement {
  const size = large ? 22 : 16;
  const Icon = kind === 'guide' ? DocIcon : kind === 'secret' ? LockIcon : TYPE_ICON[kind];
  return (
    <span className={large ? `${styles.kindIcon} ${styles.kindIconLarge}` : styles.kindIcon} data-secret={kind === 'secret' || undefined} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

export function entryKindIcon(entry: BibleEntry): KindIconKind {
  return entry.kind === 'guide' ? 'guide' : entry.entity.type;
}

export function SecretCountChip({ count }: { count: number }): ReactElement {
  return (
    <StatusChip intent="warning">
      <LockIcon size={11} />
      {secretCountLabel(count)}
    </StatusChip>
  );
}

export interface EntryRowProps {
  novelId: string;
  entry: BibleEntry;
  search: BibleSearch;
  selected: boolean;
  secretCount: number;
  meta: string;
}

export function EntryRow({ novelId, entry, search, selected, secretCount, meta }: EntryRowProps): ReactElement {
  return (
    <li>
      <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={search} className={styles.row} aria-current={selected ? 'true' : undefined}>
        <KindIcon kind={entryKindIcon(entry)} />
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{entry.name}</span>
          {entry.summary && <span className={styles.rowSummary}>{entry.summary}</span>}
        </span>
        <span className={styles.rowMeta}>
          <span>{meta}</span>
          {secretCount > 0 && <SecretCountChip count={secretCount} />}
        </span>
      </Link>
    </li>
  );
}

export function secretCountOf(entry: BibleEntry, secretCounts: ReadonlyMap<string, number>): number {
  return entry.kind === 'record' ? (secretCounts.get(entry.entity.entityKey) ?? 0) : 0;
}

interface EntryGroupsProps {
  novelId: string;
  groups: readonly EntryGroup[];
  selectedId: string | undefined;
  secretCounts: ReadonlyMap<string, number>;
  searchFor: (entry: BibleEntry) => BibleSearch;
  withKind: boolean;
  metaFor?: (entry: BibleEntry) => string;
}

export function EntryGroups({ novelId, groups, selectedId, secretCounts, searchFor, withKind, metaFor }: EntryGroupsProps): ReactElement {
  return (
    <>
      {groups.map(group => (
        <section key={group.key} aria-label={group.label}>
          <h3 className={styles.groupHead}>
            {group.label} · {group.entries.length}
          </h3>
          <ul className={styles.rows}>
            {group.entries.map(entry => (
              <EntryRow
                key={entry.id}
                novelId={novelId}
                entry={entry}
                search={searchFor(entry)}
                selected={entry.id === selectedId}
                secretCount={secretCountOf(entry, secretCounts)}
                meta={metaFor ? metaFor(entry) : entryMeta(entry, withKind)}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

interface ListHeadProps {
  title: string;
  description: ReactNode;
}

export function ListHead({ title, description }: ListHeadProps): ReactElement {
  return (
    <div className={styles.listHead}>
      <h2 className={styles.listTitle}>{title}</h2>
      <p className={styles.listDesc}>{description}</p>
    </div>
  );
}

export interface TopicListProps {
  novelId: string;
  topic: BibleTopic;
  groups: readonly EntryGroup[];
  kind: EntryKindFilter;
  onKindChange: (kind: EntryKindFilter) => void;
  emptyPlaceholders: number;
  onTidy: () => void;
  selectedId: string | undefined;
  secretCounts: ReadonlyMap<string, number>;
  searchFor: (entry: BibleEntry) => BibleSearch;
}

export function TopicList({ novelId, topic, groups, kind, onKindChange, emptyPlaceholders, onTidy, selectedId, secretCounts, searchFor }: TopicListProps): ReactElement {
  return (
    <>
      <ListHead title={TOPIC_LABEL[topic]} description={TOPIC_DESCRIPTION[topic]} />
      <div className={styles.filters}>
        <SegmentedControl size="sm" aria-label="Show" value={kind} onValueChange={value => onKindChange(value as EntryKindFilter)}>
          {ENTRY_KIND_FILTERS.map(filter => (
            <SegmentedControl.Item key={filter.value} value={filter.value}>
              {filter.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      {groups.length === 0 ? (
        <p className={styles.listEmpty}>{kind === 'all' ? 'Nothing in this topic yet.' : 'Nothing of this kind in this topic.'}</p>
      ) : (
        <EntryGroups novelId={novelId} groups={groups} selectedId={selectedId} secretCounts={secretCounts} searchFor={searchFor} withKind={false} />
      )}
      {emptyPlaceholders > 0 && (
        <div className={styles.placeholderLine}>
          <span>{emptyPlaceholdersLabel(emptyPlaceholders)} in this topic</span>
          <Button variant="secondary" size="sm" onClick={onTidy}>
            Remove
          </Button>
        </div>
      )}
    </>
  );
}

export interface SecretRowProps {
  novelId: string;
  fact: FactResponse;
  subjectNames: readonly string[];
  search: BibleSearch;
  selected: boolean;
}

export function SecretRow({ novelId, fact, subjectNames, search, selected }: SecretRowProps): ReactElement {
  return (
    <li>
      <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={search} className={styles.row} aria-current={selected ? 'true' : undefined}>
        <KindIcon kind="secret" />
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{secretTitle(fact.factKey)}</span>
          <span className={styles.rowSummary}>{subjectsLabel(subjectNames)}</span>
        </span>
        <span className={styles.rowMeta}>
          {fact.revealChapter != null ? <StatusChip intent="warning">ch {fact.revealChapter}</StatusChip> : <span>{secretRevealLabel(fact)}</span>}
        </span>
      </Link>
    </li>
  );
}

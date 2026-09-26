import { useId, useState } from 'react';
import { Button, Input, SegmentedControl, Select } from '@shadow-library/ui';

import { SearchIcon } from '@/components/icons';
import { type ChapterShow } from '@/lib/chapter-list';

import styles from './ChapterToolbar.module.css';

// Radix Select refuses an empty value, so "no filter" needs a value no entity or thread key can take.
const UNFILTERED = '*';

const SHOW_LABEL: Record<ChapterShow, string> = { all: 'All', not_final: 'Not final', final: 'Final' };

export interface FilterOption {
  key: string;
  name: string;
}

interface FilterSelectProps {
  label: string;
  anyLabel: string;
  options: readonly FilterOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
}

function FilterSelect({ label, anyLabel, options, value, onChange }: FilterSelectProps): React.JSX.Element | null {
  const id = useId();
  if (options.length === 0) return null;
  return (
    <span className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <Select triggerId={id} className={styles.select} value={value ?? UNFILTERED} onValueChange={next => onChange(next === UNFILTERED ? undefined : next)}>
        <Select.Item value={UNFILTERED}>{anyLabel}</Select.Item>
        {options.map(option => (
          <Select.Item key={option.key} value={option.key}>
            {option.name}
          </Select.Item>
        ))}
      </Select>
    </span>
  );
}

export interface ChapterToolbarProps {
  show: ChapterShow;
  counts: Record<ChapterShow, number>;
  onShow: (show: ChapterShow) => void;
  povOptions: readonly FilterOption[];
  pov?: string;
  onPov: (pov: string | undefined) => void;
  threadOptions: readonly FilterOption[];
  thread?: string;
  onThread: (thread: string | undefined) => void;
  query?: string;
  onSearch: (query: string | undefined) => void;
  onJump: (text: string) => void;
}

export function ChapterToolbarStatus({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p role="status" className={styles.status}>
      {children}
    </p>
  );
}

export function ChapterToolbar(props: ChapterToolbarProps): React.JSX.Element {
  const { show, counts, onShow, povOptions, pov, onPov, threadOptions, thread, onThread, query, onSearch, onJump } = props;
  const searchId = useId();
  const jumpId = useId();
  const [searchText, setSearchText] = useState(query ?? '');
  const [jumpText, setJumpText] = useState('');

  const [syncedQuery, setSyncedQuery] = useState(query);
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setSearchText(query ?? '');
  }

  const changeSearch = (value: string): void => {
    setSearchText(value);
    if (value === '') onSearch(undefined);
  };

  const submitSearch = (event: React.FormEvent): void => {
    event.preventDefault();
    onSearch(searchText.trim() || undefined);
  };

  const submitJump = (event: React.FormEvent): void => {
    event.preventDefault();
    onJump(jumpText);
  };

  return (
    <div className={styles.toolbar}>
      <SegmentedControl value={show} onValueChange={value => onShow(value as ChapterShow)} aria-label="Show">
        {(Object.keys(SHOW_LABEL) as ChapterShow[]).map(value => (
          <SegmentedControl.Item key={value} value={value}>
            {SHOW_LABEL[value]} <span className={styles.count}>{counts[value]}</span>
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
      <FilterSelect label="Point of view" anyLabel="Everyone" options={povOptions} value={pov} onChange={onPov} />
      <FilterSelect label="Thread" anyLabel="Any" options={threadOptions} value={thread} onChange={onThread} />
      <form role="search" className={styles.search} onSubmit={submitSearch}>
        <label className="sr-only" htmlFor={searchId}>
          Search chapter text
        </label>
        <Input id={searchId} type="search" clearable prefix={<SearchIcon size={14} />} placeholder="Search chapter text…" value={searchText} onValueChange={changeSearch} />
      </form>
      <form className={styles.jump} onSubmit={submitJump}>
        <label className="sr-only" htmlFor={jumpId}>
          Go to chapter
        </label>
        <Input id={jumpId} className={styles.jumpField} inputMode="numeric" placeholder="Chapter number" value={jumpText} onValueChange={setJumpText} />
        <Button variant="secondary" type="submit">
          Go to chapter
        </Button>
      </form>
    </div>
  );
}

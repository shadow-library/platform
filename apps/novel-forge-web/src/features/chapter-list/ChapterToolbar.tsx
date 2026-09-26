import { useId, useState } from 'react';
import { Button, Input, SegmentedControl, Select } from '@shadow-library/ui';

import { SearchIcon } from '@/components/icons';
import { type ChapterShow } from '@/lib/chapter-list';

import styles from './ChapterToolbar.module.css';

const ANYONE = 'all';

const SHOW_LABEL: Record<ChapterShow, string> = { all: 'All', not_final: 'Not final', final: 'Final' };

export interface PovOption {
  key: string;
  name: string;
}

export interface ChapterToolbarProps {
  show: ChapterShow;
  counts: Record<ChapterShow, number>;
  onShow: (show: ChapterShow) => void;
  povOptions: readonly PovOption[];
  pov?: string;
  onPov: (pov: string | undefined) => void;
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

export function ChapterToolbar({ show, counts, onShow, povOptions, pov, onPov, query, onSearch, onJump }: ChapterToolbarProps): React.JSX.Element {
  const povId = useId();
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
      {povOptions.length > 0 && (
        <span className={styles.field}>
          <label htmlFor={povId} className={styles.label}>
            Point of view
          </label>
          <Select triggerId={povId} className={styles.select} value={pov ?? ANYONE} onValueChange={value => onPov(value === ANYONE ? undefined : value)}>
            <Select.Item value={ANYONE}>Everyone</Select.Item>
            {povOptions.map(option => (
              <Select.Item key={option.key} value={option.key}>
                {option.name}
              </Select.Item>
            ))}
          </Select>
        </span>
      )}
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

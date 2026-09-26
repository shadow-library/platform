import { useState } from 'react';
import { SegmentedControl } from '@shadow-library/ui';

import { SidePanel } from '@/components/nf';
import { type DraftResponse } from '@/lib/apis';
import { type SettledBase } from '@/lib/chapter-editor';

import { ChapterAbout } from './ChapterAbout';
import styles from './ChapterDetails.module.css';
import { VersionsList } from './VersionsList';
import { WritersView } from './WritersView';

export type ChapterDetailsTab = 'about' | 'writer' | 'versions';

const TABS: readonly [ChapterDetailsTab, string][] = [
  ['about', 'About'],
  ['writer', 'Writer’s view'],
  ['versions', 'Versions'],
];

function isTab(value: string): value is ChapterDetailsTab {
  return TABS.some(([tab]) => tab === value);
}

export interface ChapterDetailsPanelProps {
  novelId: string;
  draft: DraftResponse;
  generating: boolean;
  settledBase: () => Promise<SettledBase>;
}

/** Matches the stacking breakpoint in ChapterDetails.module.css and chapters.module.css. */
const PHONE_QUERY = '(max-width: 960px)';

function startsCollapsed(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
}

export function ChapterDetailsPanel({ novelId, draft, generating, settledBase }: ChapterDetailsPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<ChapterDetailsTab>('about');
  return (
    <SidePanel title="Chapter details" className={styles.panel} headClassName={styles.panelHead} defaultCollapsed={startsCollapsed()}>
      <SegmentedControl size="sm" fullWidth aria-label="Chapter details" value={tab} onValueChange={value => isTab(value) && setTab(value)}>
        {TABS.map(([value, label]) => (
          <SegmentedControl.Item key={value} value={value}>
            {label}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
      {tab === 'about' && <ChapterAbout novelId={novelId} draft={draft} />}
      {tab === 'writer' && <WritersView novelId={novelId} chapter={draft.chapter} />}
      {tab === 'versions' && <VersionsList novelId={novelId} draft={draft} generating={generating} settledBase={settledBase} />}
    </SidePanel>
  );
}

import { type ReactElement } from 'react';
import { Badge, Button, Card, EmptyState, toast } from '@shadow-library/ui';

import { screenStyles } from '@/components/ScreenLayout';
import { type HeroDeck, useHeroCommand } from '@/lib/data';

import styles from './hero.module.css';

export interface TitlesPanelProps {
  deck: HeroDeck;
}

/**
 * Titles are granted by sustained patterns and never chosen (PRD §4.8) — the only choice here is which of the
 * earned ones is displayed, so unearned rows carry no action at all rather than a disabled unlock.
 */
export function TitlesPanel({ deck }: TitlesPanelProps): ReactElement {
  const command = useHeroCommand();
  const earned = deck.titles.filter(title => title.earnedOn !== null);
  const unearnedCount = deck.titles.length - earned.length;

  const display = (titleId: string): void => {
    command.mutate({ type: 'title.display', titleId }, { onSuccess: result => toast.neutral(result.message) });
  };

  if (earned.length === 0)
    return (
      <Card padding="lg">
        <EmptyState
          title="No titles yet"
          description="Titles arrive by themselves, from patterns you keep rather than goals you set. There is nothing to unlock and nothing to aim at, so this stays quiet until the first one appears."
        />
      </Card>
    );

  return (
    <>
      <div className={styles.cards}>
        {earned.map(title => {
          const displayed = title.id === deck.displayedTitleId;
          return (
            <Card key={title.id} padding="md" selected={displayed}>
              <div className={styles.tile}>
                <div className={styles.tileHead}>
                  <span className={styles.tileName}>{title.name}</span>
                  {displayed ? (
                    <Badge variant="soft" intent="info" size="sm">
                      Displayed
                    </Badge>
                  ) : null}
                </div>
                <span className={styles.tileMeta}>
                  {title.earnedFrom} · earned {title.earnedOn}
                </span>
                <div className={styles.tileAction}>
                  <Button size="sm" variant={displayed ? 'ghost' : 'secondary'} disabled={displayed} onClick={() => display(title.id)}>
                    {displayed ? 'Displayed' : `Display ${title.name}`}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className={screenStyles.cardBody}>
        {unearnedCount > 0 ? 'The rest of the catalogue arrives on its own, with no hints and no counters. ' : ''}
        One title is shown at a time, and every one you have earned is kept whatever you display.
      </p>
    </>
  );
}

import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, Progress, Skeleton } from '@shadow-library/ui';

import { Screen, screenStyles } from '@/components/ScreenLayout';
import { type HeroDeck, useHeroDeck } from '@/lib/data';

import { AchievementsPanel } from './achievements-panel';
import { CosmeticsPanel } from './cosmetics-panel';
import styles from './hero.module.css';
import { TitlesPanel } from './titles-panel';

type DeckTab = 'overview' | 'achievements' | 'titles' | 'cosmetics';

const TABS: { id: DeckTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'titles', label: 'Titles' },
  { id: 'cosmetics', label: 'Cosmetics' },
];

export function HeroScreen(): ReactElement {
  const deck = useHeroDeck();
  const [tab, setTab] = useState<DeckTab>('overview');

  return (
    <Screen
      title="Hero"
      subtitle="Everything you have earned, and nothing you can lose. Experience only ever goes up."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/hero/recovery">Coming back</Link>
        </Button>
      }
    >
      {deck.isPending || !deck.data ? (
        <>
          <Skeleton.Card />
          <Skeleton.List rows={4} />
        </>
      ) : null}

      {deck.data ? (
        <>
          <Crest deck={deck.data} />

          <div className={styles.stats}>
            {deck.data.lifetime.map(stat => (
              <Card key={stat.stat} padding="md">
                <div className={styles.statName}>{stat.label}</div>
                <div className={styles.statValue}>{stat.value.toLocaleString()}</div>
                <Progress value={stat.percentOfBest} max={100} label={`${stat.label} against your strongest stat`} />
                <p className={styles.statNote}>{stat.note}</p>
              </Card>
            ))}
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Hero sections">
            {TABS.map(item => (
              <Button key={item.id} size="sm" variant={tab === item.id ? 'secondary' : 'ghost'} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
                {item.label}
              </Button>
            ))}
          </div>

          {tab === 'overview' ? <Overview deck={deck.data} /> : null}
          {tab === 'achievements' ? <AchievementsPanel achievements={deck.data.achievements} /> : null}
          {tab === 'titles' ? <TitlesPanel deck={deck.data} /> : null}
          {tab === 'cosmetics' ? <CosmeticsPanel deck={deck.data} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function Crest({ deck }: { deck: HeroDeck }): ReactElement {
  const toNext = Math.max(0, deck.hero.xpForNextLevel - deck.hero.xpIntoLevel);
  return (
    <Card padding="lg">
      <div className={styles.crestRow}>
        <div className={styles.crest}>
          <span className={styles.crestLevel}>{deck.hero.level}</span>
          <span className={styles.crestLabel}>level</span>
        </div>
        <div className={styles.identity}>
          <div className={styles.name}>{deck.hero.title}</div>
          <p className={styles.subtitle}>{deck.subtitle}</p>
          <div className={styles.xp}>
            <Progress value={deck.hero.xpIntoLevel} max={deck.hero.xpForNextLevel} size="md" label={`Experience towards level ${deck.hero.level + 1}`} />
            <div className={styles.xpFoot}>
              <span className={screenStyles.mono}>
                {deck.hero.xpIntoLevel.toLocaleString()} / {deck.hero.xpForNextLevel.toLocaleString()} XP
              </span>
              <span>
                {toNext.toLocaleString()} to level {deck.hero.level + 1} · experience is never taken away
              </span>
            </div>
          </div>
        </div>
        <div className={styles.tallies}>
          <div>
            <div className={styles.tallyLabel}>Coins</div>
            <div className={styles.tallyValue}>◈ {deck.hero.coins.toLocaleString()}</div>
          </div>
          <div>
            <div className={styles.tallyLabel}>HP</div>
            <div className={styles.pips} role="img" aria-label={`HP ${deck.hero.hp} of ${deck.hero.hpMax}`}>
              {Array.from({ length: deck.hero.hpMax }, (_, index) => (
                <span key={index} className={styles.pip} data-filled={index < deck.hero.hp} />
              ))}
            </div>
            <div className={styles.tallyNote}>{deck.hpNote}</div>
          </div>
          <div>
            <div className={styles.tallyLabel}>Shields</div>
            <div className={styles.tallyValue}>
              {deck.shields} of {deck.shieldCap}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Overview({ deck }: { deck: HeroDeck }): ReactElement {
  return (
    <div className={screenStyles.columns}>
      <div className={screenStyles.column}>
        <Card padding="md">
          <h2 className={screenStyles.cardTitle}>Recent progression</h2>
          {deck.events.length === 0 ? (
            <p className={screenStyles.cardBody}>Nothing has happened yet. The first quest you keep appears here, and everything after it stays.</p>
          ) : (
            <ul className={styles.events}>
              {deck.events.map(event => (
                <li key={event.id} className={styles.event}>
                  <span className={styles.eventWhen}>{event.when}</span>
                  <span>
                    <span className={styles.eventTitle}>{event.title}</span>
                    <span className={styles.eventMeta}>{event.meta}</span>
                  </span>
                  <span className={styles.eventValue} data-rewarded={event.rewarded}>
                    {event.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className={screenStyles.column}>
        <Card padding="md">
          <h2 className={screenStyles.cardTitle}>Crown · {deck.hero.crown.label}</h2>
          <Progress value={deck.hero.crown.keptPercent} max={100} size="md" label="Crown period progress" />
          <p className={screenStyles.cardBody}>{deck.crownNote}</p>
          {deck.crownHistory.length > 0 ? (
            <div className={styles.crowns}>
              {deck.crownHistory.map(record => (
                <span
                  key={record.label}
                  className={styles.crown}
                  data-banked={record.banked}
                  title={record.label}
                  aria-label={`${record.label}: ${record.banked ? 'banked' : 'in progress'}`}
                >
                  ♛
                </span>
              ))}
            </div>
          ) : null}
        </Card>

        <Card padding="md">
          <h2 className={screenStyles.cardTitle}>Momentum</h2>
          <p className={styles.statValue}>{deck.momentumLabel}</p>
          <p className={screenStyles.cardBody}>{deck.momentumNote}</p>
        </Card>

        <Alert intent="info" title="Experience only ever goes up">
          Missing a quest can end a streak or spend HP. It never removes experience or a level you have earned, and nothing you have already done is undone.
        </Alert>
      </div>
    </div>
  );
}

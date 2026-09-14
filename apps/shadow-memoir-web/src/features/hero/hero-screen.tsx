import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, Progress, Skeleton, Tabs } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, screenStyles } from '@/components/ScreenLayout';
import { heroAccentKey, type HeroDeck, useComingBack, useHeroDeck } from '@/lib/data';

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
  const comingBack = useComingBack();
  const [tab, setTab] = useState<DeckTab>('overview');

  return (
    <Screen
      title="Hero"
      subtitle="Everything you have earned, and nothing you can lose. Experience only ever goes up."
      actions={
        comingBack.data && comingBack.data.kind !== 'none' ? (
          <Button size="sm" variant="ghost" asChild>
            <Link to="/hero/recovery">Coming back</Link>
          </Button>
        ) : null
      }
    >
      <DataState
        query={deck}
        skeleton={
          <>
            <Skeleton.Card />
            <Skeleton.List rows={4} />
          </>
        }
      >
        {data => (
          <>
            <Crest deck={data} />

            <div className={styles.stats}>
              {data.lifetime.map(stat => (
                <Card key={stat.stat} padding="md">
                  <Card.Body>
                    <div className={styles.statName}>{stat.label}</div>
                    <div className={styles.statValue}>{stat.value.toLocaleString()}</div>
                    <Progress value={stat.percentOfBest} max={100} label={`${stat.label} against your strongest stat`} />
                    <p className={styles.statNote}>{stat.note}</p>
                  </Card.Body>
                </Card>
              ))}
            </div>

            <Tabs value={tab} onValueChange={value => setTab(value as DeckTab)}>
              <Tabs.List aria-label="Hero sections">
                {TABS.map(item => (
                  <Tabs.Tab key={item.id} value={item.id}>
                    {item.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              <Tabs.Panel value="overview">
                <Overview deck={data} />
              </Tabs.Panel>
              <Tabs.Panel value="achievements">
                <AchievementsPanel achievements={data.achievements} />
              </Tabs.Panel>
              <Tabs.Panel value="titles">
                <TitlesPanel deck={data} />
              </Tabs.Panel>
              <Tabs.Panel value="cosmetics">
                <CosmeticsPanel deck={data} />
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </DataState>
    </Screen>
  );
}

function LevelProgress({ level, xpIntoLevel, xpForNextLevel }: { level: number; xpIntoLevel: number; xpForNextLevel: number }): ReactElement {
  if (xpForNextLevel === 0) {
    return (
      <div className={styles.xp}>
        <Progress value={1} max={1} size="md" aria-label="Highest level reached" />
        <div className={styles.xpFoot}>
          <span>Highest level reached · experience is never taken away</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.xp}>
      <Progress value={xpIntoLevel} max={xpForNextLevel} size="md" label={`Experience towards level ${level + 1}`} />
      <div className={styles.xpFoot}>
        <span className={screenStyles.mono}>
          {xpIntoLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
        </span>
        <span>
          {Math.max(0, xpForNextLevel - xpIntoLevel).toLocaleString()} to level {level + 1} · experience is never taken away
        </span>
      </div>
    </div>
  );
}

const HP_PIP_CAP = 10;

function HpTally({ hp, hpMax }: { hp: number; hpMax: number }): ReactElement {
  if (hpMax === 0) return <div className={styles.tallyValue}>No HP yet</div>;

  if (hpMax > HP_PIP_CAP)
    return (
      <div className={styles.hpBar}>
        <Progress value={hp} max={hpMax} size="sm" label={`HP ${hp} of ${hpMax}`} />
      </div>
    );

  return (
    <div className={styles.pips} role="img" aria-label={`HP ${hp} of ${hpMax}`}>
      {Array.from({ length: hpMax }, (_, index) => (
        <span key={index} className={styles.pip} data-filled={index < hp} />
      ))}
    </div>
  );
}

function Crest({ deck }: { deck: HeroDeck }): ReactElement {
  return (
    <Card padding="lg" data-hero-accent={heroAccentKey(deck.cosmetics) ?? undefined}>
      <Card.Body>
        <div className={styles.crestRow}>
          <div className={styles.crest}>
            <span className={styles.crestLevel}>{deck.hero.level}</span>
            <span className={styles.crestLabel}>level</span>
          </div>
          <div className={styles.identity}>
            <div className={styles.name}>{deck.hero.title}</div>
            <p className={styles.subtitle}>{deck.subtitle}</p>
            {deck.hero.xpForNextLevel === null ? null : <LevelProgress level={deck.hero.level} xpIntoLevel={deck.hero.xpIntoLevel} xpForNextLevel={deck.hero.xpForNextLevel} />}
          </div>
          <div className={styles.tallies}>
            <div>
              <div className={styles.tallyLabel}>Coins</div>
              <div className={styles.tallyValue}>◈ {deck.hero.coins.toLocaleString()}</div>
            </div>
            <div>
              <div className={styles.tallyLabel}>HP</div>
              <HpTally hp={deck.hero.hp} hpMax={deck.hero.hpMax} />
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
      </Card.Body>
    </Card>
  );
}

function Overview({ deck }: { deck: HeroDeck }): ReactElement {
  return (
    <div className={screenStyles.columns}>
      <div className={screenStyles.column}>
        <Card padding="md">
          <Card.Body>
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
          </Card.Body>
        </Card>
      </div>

      <div className={screenStyles.column}>
        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Crown · {deck.hero.crown.label}</h2>
            <Progress value={deck.hero.crown.keptPercent} max={100} size="md" aria-label={`Crown ${deck.hero.crown.label}: ${deck.hero.crown.keptPercent}% kept`} />
            <p className={screenStyles.cardBody}>{deck.crownNote}</p>
            {deck.crownHistory.length > 0 ? (
              <div className={styles.crowns}>
                {deck.crownHistory.map(record => (
                  <span
                    key={record.label}
                    className={styles.crown}
                    data-banked={record.banked}
                    title={record.label}
                    aria-label={`${record.label}: ${record.banked ? 'banked' : 'not banked'}`}
                  >
                    ♛
                  </span>
                ))}
              </div>
            ) : null}
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h2 className={screenStyles.cardTitle}>Momentum</h2>
            <p className={styles.name}>{deck.momentumLabel}</p>
            <p className={screenStyles.cardBody}>{deck.momentumNote}</p>
          </Card.Body>
        </Card>

        <Alert intent="info" title="Experience only ever goes up">
          Missing a quest can end a streak or spend HP. It never removes experience or a level you have earned, and nothing you have already done is undone.
        </Alert>
      </div>
    </div>
  );
}

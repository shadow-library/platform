import {
  type AccountProvider,
  type Achievement,
  ACHIEVEMENTS,
  COMING_BACK_NOTICES,
  type ComingBack,
  type ComingBackReason,
  type Cosmetic,
  COSMETICS,
  type CrownPeriod,
  type DispatchOptions,
  type HeroCommand,
  type HeroDeck,
  type HeroProvider,
  type HeroTitle,
  hpNoteFor,
  hpStat,
  INTENSITY_OPTIONS,
  type Momentum,
  nameFor,
  type RecoveryView,
  type SettledCommandResult,
  STARTER_COSMETIC_ID,
  STAT_LABELS,
  type StatAffinity,
  TITLES,
} from '@/lib/data';
import { accountDay, formatCount, formatLocalDate, formatRelativeDay } from '@/lib/format';

import { isHeroCommand } from './command-wire';
import { ignoreAccountBoundary } from './memoir-store';
import {
  type ClosedCrown,
  type HeroEventRecord,
  type HeroEventType,
  type HeroGrants,
  type HeroStanding,
  projectCrownHistory,
  projectHeroEvents,
  projectHeroGrants,
  projectHeroStanding,
  projectRecentMisses,
  type RecentMiss,
} from './projection';
import { type SyncEngine } from './sync-engine';
import { SYNC_META_KEYS } from './sync.types';

const EVENT_LIMIT = 8;
const CROWN_HISTORY_LENGTH = 7;

const MOMENTUM_LABELS: Record<Momentum, string> = { cold: 'Settling', steady: 'Steady', warm: 'Warm' };

const STAT_ORDER: StatAffinity[] = ['body', 'mind', 'wealth', 'discipline'];

const STAT_NOTES: Record<StatAffinity, string> = {
  body: 'Movement, sleep, food, strength',
  mind: 'Reading, writing, study, focus',
  wealth: 'Spending, saving, admin',
  discipline: 'Anchors, tidiness, follow-through',
};

const HIDDEN_EVENT_TYPES: HeroEventType[] = ['crown_init'];

const EVENT_TITLES: Record<HeroEventType, (event: HeroEventRecord) => string> = {
  quest_complete: event => `${event.questName ?? 'A quest'} kept`,
  quest_partial: event => `${event.questName ?? 'A quest'} partly kept`,
  quest_late: event => `${event.questName ?? 'A quest'} kept late`,
  recovery: event => `${event.questName ?? 'A recovery quest'} kept`,
  level_up: event => (event.levelAfter === null ? 'New level reached' : `Level ${event.levelAfter} reached`),
  achievement_unlock: event => `${ACHIEVEMENTS.find(achievement => achievement.id === event.achievementId)?.name ?? 'An achievement'} earned`,
  coin_grant: () => 'Coins granted',
  crown_banked: () => 'Crown banked',
  side_quest: () => 'Side quest logged',
  journal: () => 'Journal entry written',
  meal: () => 'Meal logged',
  weight: () => 'Weight logged',
  coin_spend: () => 'Cosmetic unlocked',
  recovery_spawned: event => (event.questName ? `Recovery quest offered for ${event.questName}` : 'Recovery quest offered'),
  recovery_completed: () => 'Recovery quest kept',
  recovery_expired: () => 'Recovery quest closed unkept',
  crown_init: () => 'Crown period opened',
  crown_forfeit: event => `Crown share lost on ${event.questName ?? 'a quest'}`,
  returner_fired: () => 'Welcome back',
};

interface ComingBackCopy {
  headline: string;
  body: string;
  choices: RecoveryView['choices'];
}

const TODAY_CHOICE: RecoveryView['choices'][number] = {
  id: 'today',
  title: 'Keep one quest today',
  body: 'Pick whichever quest on today’s list feels manageable. There is nothing to catch up on.',
  effect: 'Grants experience as usual.',
  actionLabel: 'Go to today',
  to: '/',
};

const WEEK_CHOICE: RecoveryView['choices'][number] = {
  id: 'week',
  title: 'Look over the week',
  body: 'Moving or pausing a quest can make the coming days lighter.',
  effect: 'Nothing changes until you move or pause something.',
  actionLabel: 'See the week',
  to: '/plan',
};

const COMING_BACK_COPY: Record<ComingBackReason | 'none', ComingBackCopy> = {
  returner: {
    headline: COMING_BACK_NOTICES.returner.title,
    body: COMING_BACK_NOTICES.returner.body,
    choices: [TODAY_CHOICE, WEEK_CHOICE],
  },
  recovery: {
    headline: COMING_BACK_NOTICES.recovery.title,
    body: COMING_BACK_NOTICES.recovery.body,
    choices: [{ ...TODAY_CHOICE, title: 'Keep the recovery quest', body: 'It is on today’s list and judged on the day rather than the hour.' }, WEEK_CHOICE],
  },
  comeback: {
    headline: 'A comeback bonus is ready',
    body: 'After recent misses, the next anchor or routine quest you keep today earns extra experience and a coin.',
    choices: [{ ...TODAY_CHOICE, title: 'Keep an anchor or routine quest', effect: 'Grants experience with the comeback bonus added.' }, WEEK_CHOICE],
  },
  none: {
    headline: 'Nothing to come back from',
    body: 'Nothing is waiting for you here today. After a missed day or a break, this page shows what changed and the choices open to you.',
    choices: [],
  },
};

const COMEBACK_CLAIMED_COPY: ComingBackCopy = {
  headline: 'Comeback bonus claimed',
  body: 'You kept a quest after recent misses today, and the comeback bonus was added to it. There is nothing else to do.',
  choices: [WEEK_CHOICE],
};

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

/** No `cosmetic_unlocks` row ever seeds `STARTER_COSMETIC_ID`, so its "equipped" look is display-only and drops once another badge is genuinely equipped. */
function cosmeticsFor(grants: HeroGrants, coins: number): Cosmetic[] {
  return COSMETICS.map(seed => {
    const owned = grants.ownedCosmetics.has(seed.id);
    if (seed.id === STARTER_COSMETIC_ID && !owned) {
      const state: Cosmetic['state'] = grants.equippedCosmetics.badge === undefined ? 'equipped' : 'starter';
      return { ...seed, state, shortfallCoins: null };
    }
    const equipped = grants.equippedCosmetics[seed.kind] === seed.id;
    const shortfall = seed.priceCoins === null ? null : Math.max(0, seed.priceCoins - coins);
    const state: Cosmetic['state'] = equipped ? 'equipped' : owned ? 'owned' : seed.priceCoins === null ? 'achievement' : shortfall === 0 ? 'affordable' : 'short';
    return { ...seed, state, shortfallCoins: state === 'short' ? shortfall : null };
  });
}

function comingBackReason(standing: HeroStanding): ComingBackReason | null {
  if (standing.persona !== 'active') return standing.persona;
  return standing.comeback ? 'comeback' : null;
}

function comingBackCopy(comingBack: ComingBack, standing: HeroStanding): ComingBackCopy {
  if (comingBack.kind === 'none') return COMING_BACK_COPY.none;
  if (comingBack.reason === 'comeback' && standing.comeback?.armed === false) return COMEBACK_CLAIMED_COPY;
  return COMING_BACK_COPY[comingBack.reason];
}

function crownNote(crown: CrownPeriod): string {
  if (crown.cadence === 'daily') return `Closes at the end of today · ${crown.keptPercent}% kept.`;
  return `Day ${crown.dayIndex} of ${crown.dayCount} · closes ${formatLocalDate(crown.closesOn, { year: false })} · ${crown.keptPercent}% kept.`;
}

function closedCrownLabel(crown: ClosedCrown): string {
  const closed = formatLocalDate(crown.closedOn, { year: false });
  return crown.periodStart === crown.closedOn ? closed : `${formatLocalDate(crown.periodStart, { year: false })} – ${closed}`;
}

function lifetimeStats(stats: Record<StatAffinity, number>): HeroDeck['lifetime'] {
  const best = Math.max(...STAT_ORDER.map(stat => stats[stat]));
  return STAT_ORDER.map(stat => ({
    stat,
    label: STAT_LABELS[stat],
    value: stats[stat],
    percentOfBest: best === 0 ? 0 : Math.round((stats[stat] / best) * 100),
    note: STAT_NOTES[stat],
  }));
}

function eventValue(event: HeroEventRecord): string {
  const xp = event.xpDelta > 0 ? `+${event.xpDelta} XP` : null;
  const coins = event.coinsDelta === 0 ? null : `${event.coinsDelta > 0 ? '+' : '−'}${Math.abs(event.coinsDelta)} ◈`;
  return [xp, coins].filter(Boolean).join(' · ');
}

function toProgressionEvent(event: HeroEventRecord, today: string): HeroDeck['events'][number] {
  return {
    id: event.id,
    when: formatRelativeDay(event.date, today),
    title: EVENT_TITLES[event.type](event),
    meta: event.statAffinity && event.statDelta > 0 ? `${STAT_LABELS[event.statAffinity]} +${event.statDelta}` : '',
    value: eventValue(event),
    rewarded: event.xpDelta > 0 || event.coinsDelta > 0,
  };
}

function missedRecently(misses: RecentMiss[]): RecoveryView['missed'] {
  return misses
    .map(quest => ({ quest, last: quest.misses[quest.misses.length - 1]?.date ?? '' }))
    .sort((left, right) => right.last.localeCompare(left.last))
    .map(({ quest, last }) => {
      const shielded = quest.misses.filter(miss => miss.shielded).length;
      const when =
        quest.misses.length === 1
          ? formatLocalDate(last, { year: false })
          : `${formatCount(quest.misses.length, 'miss', 'misses')} · last ${formatLocalDate(last, { year: false })}`;
      return {
        id: quest.questId,
        title: quest.questName,
        meta: shielded > 0 && quest.misses.length > 1 ? `${when} · ${shielded} shielded` : when,
        state: shielded === quest.misses.length ? 'Shielded' : 'Missed',
      };
    });
}

function shieldNote(standing: HeroStanding): string {
  if (standing.shieldCap === 0) return 'None of your quests can hold a shield yet. Quests on a streak earn them as you keep them.';
  return `You hold ${standing.shieldsAvailable} of ${standing.shieldCap} shields across your quests. A shield keeps a quest’s streak alive through a missed occurrence, and the day is marked shielded in History.`;
}

/**
 * The hero deck read from the account row and the progression domains, with purchases, equips and title display
 * written through the outbox. `intensity.set` is an account setting rather than a hero command, so it goes out as the
 * same deferred `PATCH /account` the settings screen uses.
 */
export class SyncedHeroProvider implements HeroProvider {
  private grants: HeroGrants;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly sync: SyncEngine,
    private readonly account: AccountProvider,
  ) {
    this.grants = projectHeroGrants(sync.domains());
    sync.subscribeProjection(() => (this.pending = this.pending.then(() => this.reproject())));
  }

  async reproject(): Promise<void> {
    const grants = projectHeroGrants(this.sync.domains());
    for (const entry of await this.sync.outbox.pending()) if (isHeroCommand(entry.command)) this.applyLocally(grants, entry.command);
    this.grants = grants;
  }

  private applyLocally(grants: HeroGrants, command: HeroCommand): SettledCommandResult {
    if (command.type === 'title.display') {
      if (command.titleId !== null && grants.titles[command.titleId] === undefined)
        return { status: 'rejected', message: 'That title has not been earned yet. Titles arrive on their own — there is nothing to unlock here.' };
      grants.displayedTitleId = command.titleId;
      const title = TITLES.find(item => item.id === command.titleId);
      return applied(title ? `Displaying ${title.name}.` : 'No title displayed.');
    }

    if (command.type === 'cosmetic.purchase') {
      const seed = COSMETICS.find(item => item.id === command.cosmeticId);
      if (!seed || seed.priceCoins === null) return { status: 'rejected', message: 'That accent comes with an achievement rather than with coins.' };
      if (grants.ownedCosmetics.has(seed.id)) return applied(`${seed.name} is already yours.`);

      const coins = this.sync.world().hero.coins;
      if (seed.priceCoins > coins)
        return { status: 'rejected', message: `${seed.name} costs ${seed.priceCoins} coins and you have ${coins}. Kept quests and crowns are the only way coins arrive.` };

      grants.ownedCosmetics.add(seed.id);
      grants.equippedCosmetics[seed.kind] = seed.id;
      return applied(`${seed.name} unlocked and equipped.`);
    }

    if (command.type === 'cosmetic.equip') {
      const seed = COSMETICS.find(item => item.id === command.cosmeticId);
      if (!seed || !grants.ownedCosmetics.has(seed.id)) return { status: 'rejected', message: 'That accent is not yours yet.' };
      grants.equippedCosmetics[seed.kind] = seed.id;
      return applied(`${seed.name} equipped.`);
    }

    return applied('');
  }

  private async comingBackFor(standing: HeroStanding, day: string): Promise<ComingBack> {
    const reason = comingBackReason(standing);
    if (!reason) return { kind: 'none' };
    const dismissedOn = await this.sync.store.readMeta<string>(SYNC_META_KEYS.comingBackDismissedOn);
    return { kind: dismissedOn === day ? 'dismissed' : 'offered', reason };
  }

  async getDeck(): Promise<HeroDeck> {
    const hero = this.sync.world().hero;
    const rows = this.sync.domains();
    const standing = projectHeroStanding(rows);
    const day = accountDay(standing.timezone);
    const titles: HeroTitle[] = TITLES.map(seed => ({ ...seed, earnedOn: this.grants.titles[seed.id] ?? null }));
    const achievements: Achievement[] = ACHIEVEMENTS.map(seed => ({ ...seed, earnedOn: this.grants.achievements[seed.id] ?? null }));
    const displayed = titles.find(title => title.id === this.grants.displayedTitleId);
    const earned = achievements.filter(item => item.earnedOn !== null).length;

    return {
      hero: {
        ...hero,
        title: nameFor(
          displayed?.name,
          titles.some(title => title.earnedOn !== null),
        ),
      },
      subtitle: [
        `Level ${hero.level}`,
        standing.activeDays === null ? null : formatCount(standing.activeDays, 'active day', 'active days'),
        formatCount(earned, 'achievement', 'achievements'),
      ]
        .filter(Boolean)
        .join(' · '),
      shields: standing.shieldsAvailable,
      shieldCap: standing.shieldCap,
      hpNote: hpNoteFor(hero.hp, hero.hpMax),
      momentumLabel: standing.persona === 'active' ? MOMENTUM_LABELS[hero.momentum] : 'Returning',
      momentumNote: 'Momentum describes the last two weeks. It is not a currency and it cannot go negative.',
      crownNote: crownNote(hero.crown),
      crownHistory: projectCrownHistory(rows)
        .slice(-CROWN_HISTORY_LENGTH)
        .map(crown => ({ label: closedCrownLabel(crown), banked: crown.banked })),
      lifetime: lifetimeStats(standing.stats),
      events: projectHeroEvents(rows)
        .filter(event => !HIDDEN_EVENT_TYPES.includes(event.type))
        .slice(0, EVENT_LIMIT)
        .map(event => toProgressionEvent(event, day)),
      achievements,
      titles,
      displayedTitleId: this.grants.displayedTitleId,
      cosmetics: cosmeticsFor(this.grants, hero.coins),
    };
  }

  async getRecovery(): Promise<RecoveryView> {
    const hero = this.sync.world().hero;
    const rows = this.sync.domains();
    const standing = projectHeroStanding(rows);
    const day = accountDay(standing.timezone);
    const [comingBack, preferences] = await Promise.all([this.comingBackFor(standing, day), this.account.getDay()]);
    const copy = comingBackCopy(comingBack, standing);

    return {
      comingBack,
      headline: copy.headline,
      body: copy.body,
      stats: [
        hpStat(hero.hp, hero.hpMax),
        { kind: 'value', label: 'Shields held', value: standing.shieldsAvailable, unit: `of ${standing.shieldCap}` },
        { kind: 'value', label: 'Crown kept', value: hero.crown.keptPercent, unit: '%' },
      ],
      choices: comingBack.kind === 'offered' ? copy.choices : [],
      intensity: preferences.intensity,
      pendingIntensity: preferences.pendingIntensity,
      intensityOptions: INTENSITY_OPTIONS,
      missed: missedRecently(projectRecentMisses(rows, day)),
      progress: null,
      overload: null,
      shieldNote: shieldNote(standing),
    };
  }

  getComingBack(): Promise<ComingBack> {
    const standing = projectHeroStanding(this.sync.domains());
    return this.comingBackFor(standing, accountDay(standing.timezone));
  }

  async dismissComingBack(): Promise<void> {
    await this.sync.store.writeMeta(SYNC_META_KEYS.comingBackDismissedOn, accountDay(projectHeroStanding(this.sync.domains()).timezone));
  }

  async dispatchCommand(command: HeroCommand, options?: DispatchOptions): Promise<SettledCommandResult> {
    if (command.type === 'intensity.set') return this.account.dispatchCommand({ type: 'day.set', patch: { intensity: command.mode } });

    const result = this.applyLocally(this.grants, command);
    if (result.status === 'rejected') return result;
    const delivery = await this.sync.enqueue(command, this.sync.today, options);
    if (delivery.status === 'refused') await this.reproject().catch(ignoreAccountBoundary);
    return { ...result, delivery };
  }
}

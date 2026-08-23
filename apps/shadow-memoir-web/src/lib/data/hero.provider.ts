import { type SettledCommandResult } from './command.types';
import { type Persona } from './fixtures';
import { type Achievement, type Cosmetic, type HeroCommand, type HeroDeck, type HeroIntensityMode, type HeroTitle, type RecoveryView } from './hero.types';
import { type HeroState } from './view.types';

export interface HeroProvider {
  getDeck(): Promise<HeroDeck>;
  getRecovery(): Promise<RecoveryView>;
  dispatchCommand(command: HeroCommand): Promise<SettledCommandResult>;
}

interface AchievementSeed {
  id: string;
  name: string;
  crest: string;
  teaser: string;
  description: string;
  reward: string;
}

/** The Phase 1 catalogue of seventeen, in the order PRD §4.7 lists them. */
const ACHIEVEMENTS: AchievementSeed[] = [
  { id: 'first_quest', name: 'First Promise', crest: '◈', teaser: 'Something about beginning', description: 'The first quest you completed.', reward: '+50 XP' },
  { id: 'first_level', name: 'Second Level', crest: '▲', teaser: 'Something about the first climb', description: 'The first level you reached.', reward: '+50 XP · 10 coins' },
  { id: 'streak_bronze', name: 'Three Days', crest: '·', teaser: 'Something about three days', description: 'A three-day run on any quest.', reward: '+60 XP' },
  { id: 'streak_silver', name: 'Seven Days', crest: '∴', teaser: 'Something about a full week', description: 'A seven-day run on any quest.', reward: '+120 XP' },
  {
    id: 'streak_gold',
    name: 'Thirty Mornings',
    crest: '☀',
    teaser: 'Something about winter mornings',
    description: 'A thirty-day run on any quest. It says more about your evenings than your mornings.',
    reward: '+250 XP · title Anchor Holder',
  },
  {
    id: 'streak_platinum',
    name: 'A Hundred Days',
    crest: '❖',
    teaser: 'Something about a hundred of anything',
    description: 'A hundred-day run on one quest.',
    reward: '+600 XP · 80 coins',
  },
  { id: 'xp_100', name: 'First Hundred', crest: '◦', teaser: 'Something about the first hundred', description: 'A hundred experience earned.', reward: '+25 XP' },
  { id: 'xp_500', name: 'Five Hundred', crest: '◎', teaser: 'Something about five hundred', description: 'Five hundred experience earned.', reward: '+75 XP' },
  {
    id: 'first_subscription',
    name: 'Named the Recurring',
    crest: '↻',
    teaser: 'Something about money that repeats',
    description: 'The first subscription you confirmed.',
    reward: '+40 XP',
  },
  {
    id: 'first_receipt',
    name: 'Honest Ledger',
    crest: '◇',
    teaser: 'Something about a quiet month of spending',
    description: 'The first receipt you scanned into an expense.',
    reward: '+200 XP · title Wealth Disciplined',
  },
  {
    id: 'all_stats',
    name: 'Four Directions',
    crest: '✧',
    teaser: 'Something about being more than one thing',
    description: 'Body, mind, wealth and discipline all moved.',
    reward: '+150 XP',
  },
  { id: 'full_hp_day', name: 'Whole Day', crest: '□', teaser: 'Something about a day with nothing dropped', description: 'A full day with no quest missed.', reward: '+80 XP' },
  {
    id: 'first_crown',
    name: 'First Crown',
    crest: '♛',
    teaser: 'Something about a whole period',
    description: 'A full crown period with most of its occurrences kept.',
    reward: '+400 XP · 60 coins',
  },
  {
    id: 'first_recovery',
    name: 'Lighter Version',
    crest: '◌',
    teaser: 'Something about starting smaller',
    description: 'The first recovery quest you completed.',
    reward: '+90 XP',
  },
  { id: 'locked_day', name: 'Committed', crest: '⊞', teaser: 'Something about deciding in advance', description: 'A locked day cleared in full.', reward: '+120 XP' },
  {
    id: 'comeback',
    name: 'Comeback',
    crest: '↺',
    teaser: 'Something you have not attempted yet',
    description: 'Returned after a break of more than a week and kept three days in a row.',
    reward: '+150 XP · 1 shield',
  },
  {
    id: 'returner_ritual',
    name: 'The Returner',
    crest: '⟲',
    teaser: 'Something about coming back twice',
    description: 'The Returner ritual, completed.',
    reward: '+180 XP · title Returner',
  },
];

/** The Phase 1 title catalogue (PRD §4.8). Titles are earned, never chosen — only which one is displayed is a choice. */
const TITLES: { id: string; name: string; earnedFrom: string }[] = [
  { id: 'steady_builder', name: 'Steady Builder', earnedFrom: 'Discipline at sixty' },
  { id: 'body_tempered', name: 'Body Tempered', earnedFrom: 'Body at sixty' },
  { id: 'wealth_disciplined', name: 'Wealth Disciplined', earnedFrom: 'Wealth at sixty' },
  { id: 'mind_cultivated', name: 'Mind Cultivated', earnedFrom: 'Mind at sixty' },
  { id: 'anchor_holder', name: 'Anchor Holder', earnedFrom: 'Thirty days on an anchor' },
  { id: 'goal_keeper', name: 'Goal Keeper', earnedFrom: 'Thirty goal quests kept' },
  { id: 'routine_forged', name: 'Routine Forged', earnedFrom: 'A hundred routine quests kept' },
  { id: 'quiet_climber', name: 'Quiet Climber', earnedFrom: 'A week-long run on three quests' },
  { id: 'architect', name: 'Architect', earnedFrom: 'Ten locked days cleared' },
  { id: 'honest_planner', name: 'Honest Planner', earnedFrom: 'Ten moves logged with a reason' },
  { id: 'reflective_practitioner', name: 'Reflective Practitioner', earnedFrom: 'Twenty reasons across twenty days' },
  { id: 'restorer', name: 'Restorer', earnedFrom: 'Five recovery quests kept' },
  { id: 'returner', name: 'Returner', earnedFrom: 'The first quest after a return' },
  { id: 'comeback_steady', name: 'Comeback Steady', earnedFrom: 'Ten comebacks' },
  { id: 'optional_surplus', name: 'Optional Surplus', earnedFrom: 'Thirty optional quests kept' },
  { id: 'cross_stat_climber', name: 'Cross-Stat Climber', earnedFrom: 'All four stats at thirty' },
  { id: 'quiet_year', name: 'Quiet Year', earnedFrom: 'A year of days with something kept' },
];

interface CosmeticSeed {
  id: string;
  name: string;
  glyph: string;
  kind: Cosmetic['kind'];
  priceCoins: number | null;
  note: string;
}

const COSMETICS: CosmeticSeed[] = [
  { id: 'ink_crest', name: 'Ink crest', glyph: '✒', kind: 'badge', priceCoins: 0, note: 'The crest you started with.' },
  { id: 'fjord_frame', name: 'Fjord frame', glyph: '❖', kind: 'hero_accent', priceCoins: 120, note: 'A cold blue edge on the hero card.' },
  { id: 'midnight_card', name: 'Midnight card', glyph: '◐', kind: 'theme_accent', priceCoins: 200, note: 'A darker accent across every surface.' },
  { id: 'iron_sigil', name: 'Iron sigil', glyph: '⛨', kind: 'badge', priceCoins: 400, note: 'Plain, heavy and slow to earn.' },
  { id: 'winter_crest', name: 'Winter crest', glyph: '❄', kind: 'badge', priceCoins: null, note: 'Comes with an achievement, never with coins.' },
  { id: 'second_crown', name: 'Second crown', glyph: '♛', kind: 'hero_accent', priceCoins: null, note: 'Comes with your third crown.' },
];

const EARNED_BY_PERSONA: Record<Persona, Record<string, string>> = {
  new: {},
  active: {
    first_quest: '2 February 2026',
    first_level: '4 February 2026',
    streak_bronze: '7 February 2026',
    streak_silver: '11 February 2026',
    streak_gold: '14 August 2026',
    xp_100: '3 February 2026',
    xp_500: '19 February 2026',
    first_receipt: '2 August 2026',
    all_stats: '28 February 2026',
    first_crown: '31 July 2026',
    comeback: '21 June 2026',
  },
  recovery: {
    first_quest: '2 February 2026',
    first_level: '4 February 2026',
    streak_bronze: '7 February 2026',
    streak_silver: '11 February 2026',
    xp_100: '3 February 2026',
    xp_500: '19 February 2026',
    first_recovery: '20 August 2026',
    comeback: '21 June 2026',
    returner_ritual: '21 August 2026',
  },
};

const TITLES_BY_PERSONA: Record<Persona, Record<string, string>> = {
  new: {},
  active: {
    anchor_holder: '14 August 2026',
    wealth_disciplined: '2 August 2026',
    mind_cultivated: '19 July 2026',
    body_tempered: '11 June 2026',
    quiet_climber: '3 May 2026',
    honest_planner: '22 March 2026',
  },
  recovery: {
    returner: '21 August 2026',
    restorer: '20 August 2026',
    body_tempered: '11 June 2026',
    honest_planner: '22 March 2026',
  },
};

const OWNED_BY_PERSONA: Record<Persona, string[]> = {
  new: ['ink_crest'],
  active: ['ink_crest', 'second_crown'],
  recovery: ['ink_crest'],
};

const LIFETIME_BY_PERSONA: Record<Persona, HeroDeck['lifetime']> = {
  new: [
    { stat: 'body', label: 'Body', value: 0, percentOfBest: 0, note: 'Movement, sleep, food, strength' },
    { stat: 'mind', label: 'Mind', value: 0, percentOfBest: 0, note: 'Reading, writing, study, focus' },
    { stat: 'wealth', label: 'Wealth', value: 0, percentOfBest: 0, note: 'Spending, saving, admin' },
    { stat: 'discipline', label: 'Discipline', value: 0, percentOfBest: 0, note: 'Anchors, tidiness, follow-through' },
  ],
  active: [
    { stat: 'body', label: 'Body', value: 412, percentOfBest: 78, note: 'Runs, strength, walks' },
    { stat: 'mind', label: 'Mind', value: 286, percentOfBest: 54, note: 'Reading, writing, learning' },
    { stat: 'wealth', label: 'Wealth', value: 198, percentOfBest: 37, note: 'Budget reviews, no-spend days' },
    { stat: 'discipline', label: 'Discipline', value: 164, percentOfBest: 31, note: 'Anchors kept, side quests' },
  ],
  recovery: [
    { stat: 'body', label: 'Body', value: 388, percentOfBest: 74, note: 'Runs, strength, walks' },
    { stat: 'mind', label: 'Mind', value: 262, percentOfBest: 50, note: 'Reading, writing, learning' },
    { stat: 'wealth', label: 'Wealth', value: 190, percentOfBest: 36, note: 'Budget reviews, no-spend days' },
    { stat: 'discipline', label: 'Discipline', value: 151, percentOfBest: 29, note: 'Anchors kept, side quests' },
  ],
};

const EVENTS_BY_PERSONA: Record<Persona, HeroDeck['events']> = {
  new: [],
  active: [
    { id: 'e1', when: 'Today', title: 'Morning run kept', meta: 'Body +1 · 12-day streak', value: '+40 XP', rewarded: true },
    { id: 'e2', when: 'Today', title: 'Side quest logged', meta: 'Fixed the bike light', value: '+15 XP', rewarded: true },
    { id: 'e3', when: 'Yesterday', title: 'Evening stretch missed', meta: 'Streak closed at 9 days · no XP change', value: '0', rewarded: false },
    { id: 'e4', when: '21 Aug', title: 'Level 14 reached', meta: 'From 8,000 XP', value: '+20 ◈', rewarded: true },
    { id: 'e5', when: '19 Aug', title: 'Shield spent', meta: 'Travel day · Morning run protected', value: '−1 shield', rewarded: false },
    { id: 'e6', when: '14 Aug', title: 'Thirty Mornings earned', meta: 'Title Anchor Holder unlocked', value: '+250 XP', rewarded: true },
    { id: 'e7', when: '11 Aug', title: 'HP spent', meta: 'Anchor quest missed · 4 of 5 left', value: '−1 HP', rewarded: false },
  ],
  recovery: [
    { id: 'e1', when: 'Today', title: 'Morning walk kept', meta: 'Recovery quest · Body +1', value: '+15 XP', rewarded: true },
    { id: 'e2', when: 'Yesterday', title: 'Read 10 pages kept', meta: 'New streak at 2 days', value: '+18 XP', rewarded: true },
    { id: 'e3', when: '21 Aug', title: 'The Returner earned', meta: 'One shield granted', value: '+180 XP', rewarded: true },
    { id: 'e4', when: '11–18 Aug', title: 'Eight days away', meta: 'Excluded from the crown period · no HP spent', value: '0', rewarded: false },
  ],
};

const CROWN_HISTORY: HeroDeck['crownHistory'] = [
  { label: 'March', banked: true },
  { label: 'April', banked: true },
  { label: 'May', banked: true },
  { label: 'June', banked: true },
  { label: 'July', banked: true },
  { label: 'August', banked: false },
];

const INTENSITY_OPTIONS: RecoveryView['intensityOptions'] = [
  { mode: 'gentle', name: 'Gentle', description: 'Three quests a day at most, no HP anywhere, shields spend on their own. A good place to come back to.' },
  { mode: 'standard', name: 'Standard', description: 'Your normal rules: strictness per quest, HP on strict misses, shields on request.' },
  { mode: 'demanding', name: 'Demanding', description: 'Strictness raised one level across the board. Available, and rarely the reason people keep going.' },
];

const MOMENTUM_COPY: Record<Persona, { label: string; note: string }> = {
  new: { label: 'Starting', note: 'Momentum describes the last two weeks. There is nothing to describe yet, and that is the expected state on day one.' },
  active: { label: 'Warm', note: 'Eleven of the last fourteen days had at least one quest kept. Momentum describes the week — it is not a currency and it cannot go negative.' },
  recovery: { label: 'Returning', note: 'Three days back. Momentum is a description of the last week, not a score, and it cannot go negative.' },
};

interface HeroFixtureState {
  persona: Persona;
  hero: HeroState;
  displayedTitleId: string | null;
  owned: Set<string>;
  equipped: Record<Cosmetic['kind'], string | null>;
  intensity: HeroIntensityMode;
}

export interface HeroFixtureOptions {
  persona?: Persona;
  hero: HeroState;
}

function achievementsFor(persona: Persona): Achievement[] {
  const earned = EARNED_BY_PERSONA[persona];
  return ACHIEVEMENTS.map(seed => ({ ...seed, earnedOn: earned[seed.id] ?? null }));
}

function titlesFor(persona: Persona): HeroTitle[] {
  const earned = TITLES_BY_PERSONA[persona];
  return TITLES.map(seed => ({ ...seed, earnedOn: earned[seed.id] ?? null }));
}

function cosmeticsFor(state: HeroFixtureState): Cosmetic[] {
  return COSMETICS.map(seed => {
    const owned = state.owned.has(seed.id);
    const equipped = state.equipped[seed.kind] === seed.id;
    const shortfall = seed.priceCoins === null ? null : Math.max(0, seed.priceCoins - state.hero.coins);
    const cosmeticState: Cosmetic['state'] = equipped ? 'equipped' : owned ? 'owned' : seed.priceCoins === null ? 'achievement' : shortfall === 0 ? 'affordable' : 'short';
    return { ...seed, state: cosmeticState, shortfallCoins: cosmeticState === 'short' ? shortfall : null };
  });
}

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

/**
 * The fixture hero. Purchases spend the same coin balance the deck reads, so an unaffordable cosmetic
 * refuses in the provider rather than only being greyed out in the screen.
 */
export function createHeroProvider({ persona = 'active', hero }: HeroFixtureOptions): HeroProvider {
  const titles = titlesFor(persona);
  const state: HeroFixtureState = {
    persona,
    hero: { ...hero },
    displayedTitleId: titles.find(title => title.name === hero.title)?.id ?? titles.find(title => title.earnedOn !== null)?.id ?? null,
    owned: new Set(OWNED_BY_PERSONA[persona]),
    equipped: { badge: 'ink_crest', hero_accent: null, theme_accent: null },
    intensity: persona === 'recovery' ? 'gentle' : 'standard',
  };

  const deck = (): HeroDeck => {
    const earnedTitles = titlesFor(state.persona);
    const displayed = earnedTitles.find(title => title.id === state.displayedTitleId);
    const momentum = MOMENTUM_COPY[state.persona];
    return {
      hero: { ...state.hero, title: displayed?.name ?? 'Unnamed hero' },
      subtitle:
        state.persona === 'new'
          ? 'Level 1 · no quests yet · nothing to lose'
          : `Level ${state.hero.level} · 214 days in Shadow Memoir · ${Object.keys(EARNED_BY_PERSONA[state.persona]).length} achievements`,
      shields: state.persona === 'new' ? 0 : 2,
      shieldCap: 3,
      hpNote: state.hero.hp === state.hero.hpMax ? 'full' : 'restores one a week on its own',
      momentumLabel: momentum.label,
      momentumNote: momentum.note,
      crownNote:
        state.persona === 'recovery'
          ? `Day ${state.hero.crown.dayIndex} of ${state.hero.crown.dayCount} · ${state.hero.crown.keptPercent}% kept. The eight days away are excluded from the period, not counted as misses.`
          : `Day ${state.hero.crown.dayIndex} of ${state.hero.crown.dayCount} · ${state.hero.crown.keptPercent}% kept.`,
      crownHistory: state.persona === 'new' ? [] : CROWN_HISTORY,
      lifetime: LIFETIME_BY_PERSONA[state.persona],
      events: EVENTS_BY_PERSONA[state.persona],
      achievements: achievementsFor(state.persona),
      titles: earnedTitles,
      displayedTitleId: state.displayedTitleId,
      cosmetics: cosmeticsFor(state),
    };
  };

  const recovery = (): RecoveryView => ({
    headline: 'What happened, and what you can do',
    body: 'You were away eight days and came back on Wednesday. Two streaks closed while you were gone, and their records are intact in History. No XP was removed, no level was lost, and your HP was not spent for days you were not here.',
    stats: [
      { label: 'Days back', value: 3 },
      { label: 'Kept since return', value: 7, unit: 'of 9' },
      { label: 'Shields held', value: 2 },
      { label: 'HP', value: state.hero.hp, unit: `of ${state.hero.hpMax}` },
    ],
    choices: [
      {
        id: 'recovery_quest',
        title: 'Add a recovery quest to today',
        body: 'A lighter version of a quest you used to keep — twenty minutes instead of forty-five, judged on the day rather than the hour.',
        effect: 'Grants XP as normal. Starts a new streak at one and leaves the closed streak in History.',
        actionLabel: 'Add a morning walk',
        to: '/quests/new',
      },
      {
        id: 'spend_shield',
        title: 'Spend a shield on Thursday',
        body: 'Thursday was a scheduled strength session you missed while away. A shield covers it for up to seven days afterwards.',
        effect: 'Keeps the strength streak at eleven. Uses one of your two shields. No HP change.',
        actionLabel: 'Open that day',
        to: '/history',
      },
      {
        id: 'keep_reduced',
        title: 'Keep the reduced load until Sunday',
        body: 'Comeback caps your day at three quests. The others are paused, not deleted.',
        effect: 'Nothing is lost. On Sunday the cap lifts by itself.',
        actionLabel: 'See the week',
        to: '/plan',
      },
    ],
    intensity: state.intensity,
    intensityOptions: INTENSITY_OPTIONS,
    missed: [
      { id: 'm1', title: 'Morning run', meta: '11–18 August · 8 occurrences', state: 'Excluded' },
      { id: 'm2', title: 'Read 20 pages', meta: '11–18 August · streak closed at 24', state: 'Closed' },
      { id: 'm3', title: 'Strength session', meta: 'Thursday 21 August', state: 'Shieldable' },
      { id: 'm4', title: 'Evening stretch', meta: 'Friday 22 August · streak closed at 9', state: 'Recoverable' },
    ],
    progressPercent: 62,
    progressNote: 'Three of five comeback days done. On Sunday the reduced load lifts by itself and HP returns to five — you do not have to do anything.',
    overload: {
      title: 'Next week reads heavy',
      body: 'Reactivating everything at once would put 41 occurrences and about 14 hours into next week, above the 26 you have kept in your best week. Comeback keeps it at 21 until Sunday.',
    },
    shieldNote:
      'A shield covers one unavoidable miss on one quest: the streak survives, no HP is spent, and the day is marked shielded in History. You earn one per kept week, up to three.',
    crown: state.hero.crown,
  });

  return {
    getDeck: () => Promise.resolve(deck()),
    getRecovery: () => Promise.resolve(recovery()),
    dispatchCommand: command => {
      if (command.type === 'title.display') {
        const title = titlesFor(state.persona).find(item => item.id === command.titleId);
        if (command.titleId !== null && (!title || title.earnedOn === null))
          return Promise.resolve({ status: 'rejected', message: 'That title has not been earned yet. Titles arrive on their own — there is nothing to unlock here.' });
        state.displayedTitleId = command.titleId;
        return Promise.resolve(applied(title ? `Displaying ${title.name}.` : 'No title displayed.'));
      }

      if (command.type === 'cosmetic.purchase') {
        const seed = COSMETICS.find(item => item.id === command.cosmeticId);
        if (!seed || seed.priceCoins === null) return Promise.resolve({ status: 'rejected', message: 'That accent comes with an achievement rather than with coins.' });
        if (state.owned.has(seed.id)) return Promise.resolve(applied(`${seed.name} is already yours.`));
        const shortfall = seed.priceCoins - state.hero.coins;
        if (shortfall > 0)
          return Promise.resolve({
            status: 'rejected',
            message: `${seed.name} costs ${seed.priceCoins} coins and you have ${state.hero.coins}. Kept quests and crowns are the only way coins arrive.`,
          });
        state.hero = { ...state.hero, coins: state.hero.coins - seed.priceCoins };
        state.owned.add(seed.id);
        state.equipped[seed.kind] = seed.id;
        return Promise.resolve(applied(`${seed.name} unlocked and equipped.`));
      }

      if (command.type === 'cosmetic.equip') {
        const seed = COSMETICS.find(item => item.id === command.cosmeticId);
        if (!seed || !state.owned.has(seed.id)) return Promise.resolve({ status: 'rejected', message: 'That accent is not yours yet.' });
        state.equipped[seed.kind] = seed.id;
        return Promise.resolve(applied(`${seed.name} equipped.`));
      }

      state.intensity = command.mode;
      const option = INTENSITY_OPTIONS.find(item => item.mode === command.mode);
      return Promise.resolve(applied(`Intensity set to ${option?.name ?? command.mode}. Experience already earned is untouched.`));
    },
  };
}

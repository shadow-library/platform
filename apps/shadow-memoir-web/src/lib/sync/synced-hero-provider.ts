import {
  type AccountProvider,
  type Achievement,
  ACHIEVEMENTS,
  type Cosmetic,
  COSMETICS,
  createHeroProvider,
  type HeroCommand,
  type HeroDeck,
  type HeroProvider,
  type HeroTitle,
  type RecoveryView,
  type SettledCommandResult,
  TITLES,
} from '@/lib/data';

import { isHeroCommand } from './command-wire';
import { type HeroGrants, projectHeroGrants } from './projection';
import { type SyncEngine } from './sync-engine';

function applied(message: string): SettledCommandResult {
  return { status: 'applied', message, xpAwarded: 0, coinsAwarded: 0 };
}

function cosmeticsFor(grants: HeroGrants, coins: number): Cosmetic[] {
  return COSMETICS.map(seed => {
    const owned = grants.ownedCosmetics.has(seed.id);
    const equipped = grants.equippedCosmetics[seed.kind] === seed.id;
    const shortfall = seed.priceCoins === null ? null : Math.max(0, seed.priceCoins - coins);
    const state: Cosmetic['state'] = equipped ? 'equipped' : owned ? 'owned' : seed.priceCoins === null ? 'achievement' : shortfall === 0 ? 'affordable' : 'short';
    return { ...seed, state, shortfallCoins: state === 'short' ? shortfall : null };
  });
}

/**
 * The hero deck read from the account row and the three progression snapshot domains, with purchases,
 * equips and title display written through the outbox. `intensity.set` is an account setting rather than a
 * hero command, so it goes out as the same deferred `PATCH /account` the settings screen uses; the recovery
 * narrative around it stays on the fixture provider, which the server has no module for.
 */
export class SyncedHeroProvider implements HeroProvider {
  private grants: HeroGrants;
  private pending: Promise<void> = Promise.resolve();
  private readonly narrative: HeroProvider;

  constructor(
    private readonly sync: SyncEngine,
    private readonly account: AccountProvider,
  ) {
    this.grants = projectHeroGrants(sync.domains());
    this.narrative = createHeroProvider({ persona: 'active', hero: sync.world().hero });
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

  async getDeck(): Promise<HeroDeck> {
    const hero = this.sync.world().hero;
    const titles: HeroTitle[] = TITLES.map(seed => ({ ...seed, earnedOn: this.grants.titles[seed.id] ?? null }));
    const achievements: Achievement[] = ACHIEVEMENTS.map(seed => ({ ...seed, earnedOn: this.grants.achievements[seed.id] ?? null }));
    const displayed = titles.find(title => title.id === this.grants.displayedTitleId);

    return {
      hero: { ...hero, title: displayed?.name ?? 'Unnamed hero' },
      subtitle: `Level ${hero.level} · ${achievements.filter(item => item.earnedOn !== null).length} achievements`,
      shields: 0,
      shieldCap: 3,
      hpNote: hero.hp === hero.hpMax ? 'full' : 'restores one a week on its own',
      momentumLabel: hero.momentum,
      momentumNote: 'Momentum describes the last two weeks. It is not a currency and it cannot go negative.',
      crownNote: `Day ${hero.crown.dayIndex} of ${hero.crown.dayCount} · ${hero.crown.keptPercent}% kept.`,
      crownHistory: [],
      lifetime: [],
      events: [],
      achievements,
      titles,
      displayedTitleId: this.grants.displayedTitleId,
      cosmetics: cosmeticsFor(this.grants, hero.coins),
    };
  }

  async getRecovery(): Promise<RecoveryView> {
    const [recovery, day] = await Promise.all([this.narrative.getRecovery(), this.account.getDay()]);
    return { ...recovery, intensity: day.pendingIntensity ?? day.intensity };
  }

  async dispatchCommand(command: HeroCommand): Promise<SettledCommandResult> {
    if (command.type === 'intensity.set') return this.account.dispatchCommand({ type: 'day.set', patch: { intensity: command.mode } });

    const result = this.applyLocally(this.grants, command);
    if (result.status === 'rejected') return result;
    await this.sync.enqueue(command, this.sync.today);
    return result;
  }
}

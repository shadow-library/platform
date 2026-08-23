import { type ReactElement } from 'react';
import { Badge, Button, Card, toast } from '@shadow-library/ui';

import { type Cosmetic, type HeroDeck, useHeroCommand } from '@/lib/data';

import styles from './hero.module.css';

export interface CosmeticsPanelProps {
  deck: HeroDeck;
}

const ACTION_LABELS: Record<Cosmetic['state'], (cosmetic: Cosmetic) => string> = {
  equipped: () => 'Equipped',
  owned: () => 'Equip',
  affordable: cosmetic => `Unlock for ${cosmetic.priceCoins} ◈`,
  short: cosmetic => `${cosmetic.shortfallCoins} more coins`,
  achievement: () => 'Comes with an achievement',
};

export function CosmeticsPanel({ deck }: CosmeticsPanelProps): ReactElement {
  const command = useHeroCommand();

  const act = (cosmetic: Cosmetic): void => {
    const type = cosmetic.state === 'owned' ? 'cosmetic.equip' : 'cosmetic.purchase';
    command.mutate({ type, cosmeticId: cosmetic.id }, { onSuccess: result => toast.neutral(result.message) });
  };

  return (
    <>
      <div className={styles.wallet}>
        <span className={styles.walletValue}>◈ {deck.hero.coins.toLocaleString()}</span>
        <span className={styles.walletNote}>Coins come from kept quests and crowns. They cannot be bought, and nothing here changes how the game plays.</span>
      </div>

      <div className={styles.cards}>
        {deck.cosmetics.map(cosmetic => {
          const owned = cosmetic.state === 'equipped' || cosmetic.state === 'owned';
          const actionable = cosmetic.state === 'owned' || cosmetic.state === 'affordable';
          return (
            <Card key={cosmetic.id} padding="md" selected={cosmetic.state === 'equipped'}>
              <div className={styles.tile}>
                <div className={styles.tileHead}>
                  <span className={styles.glyph} data-owned={owned} aria-hidden>
                    {cosmetic.glyph}
                  </span>
                  <span className={styles.tileName}>{cosmetic.name}</span>
                  {cosmetic.state === 'equipped' ? (
                    <Badge variant="soft" intent="info" size="sm">
                      Equipped
                    </Badge>
                  ) : null}
                </div>
                <span className={styles.tileMeta}>{cosmetic.note}</span>
                {cosmetic.state === 'short' ? (
                  <span className={styles.tileMeta}>
                    {cosmetic.priceCoins} coins, and you have {deck.hero.coins}. It waits here until the balance reaches it.
                  </span>
                ) : null}
                <div className={styles.tileAction}>
                  <Button size="sm" variant={cosmetic.state === 'equipped' ? 'ghost' : 'secondary'} disabled={!actionable} onClick={() => act(cosmetic)}>
                    {ACTION_LABELS[cosmetic.state](cosmetic)}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

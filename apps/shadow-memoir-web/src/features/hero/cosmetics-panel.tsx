import { type ReactElement, useRef, useState } from 'react';
import { Badge, Button, Card } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import { screenStyles } from '@/components/ScreenLayout';
import { type Cosmetic, type HeroCommand, type HeroDeck, notifyOutcome, useHeroCommand } from '@/lib/data';

import styles from './hero.module.css';

export interface CosmeticsPanelProps {
  deck: HeroDeck;
}

const ACTION_LABELS: Record<Exclude<Cosmetic['state'], 'starter'>, (cosmetic: Cosmetic) => string> = {
  equipped: () => 'Equipped',
  owned: () => 'Equip',
  affordable: cosmetic => `Unlock for ${cosmetic.priceCoins} ◈`,
  short: cosmetic => `${cosmetic.shortfallCoins} more coins`,
  achievement: () => 'Comes with an achievement',
};

function cosmeticCommand(cosmetic: Cosmetic): HeroCommand {
  return { type: cosmetic.state === 'owned' ? 'cosmetic.equip' : 'cosmetic.purchase', cosmeticId: cosmetic.id };
}

export function CosmeticsPanel({ deck }: CosmeticsPanelProps): ReactElement {
  const command = useHeroCommand();
  const [confirming, setConfirming] = useState<Cosmetic | null>(null);
  const [lastConfirming, setLastConfirming] = useState<Cosmetic | null>(null);
  const [restoreFocusTo, setRestoreFocusTo] = useState<HTMLElement | null>(null);
  const nameRefs = useRef(new Map<string, HTMLHeadingElement>());
  const anyShort = deck.cosmetics.some(cosmetic => cosmetic.state === 'short');

  const act = async (cosmetic: Cosmetic): Promise<void> => {
    const action = cosmetic.state === 'owned' ? 'equip' : 'unlock';
    const outcome = await command.run(cosmeticCommand(cosmetic));
    const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { action, subject: cosmetic.name, success: saved ? outcome.local.message : '' });
  };

  const trigger = (cosmetic: Cosmetic, opener: HTMLElement): void => {
    if (cosmetic.state !== 'affordable') return void act(cosmetic);
    setRestoreFocusTo(opener);
    setConfirming(cosmetic);
    setLastConfirming(cosmetic);
  };

  const confirmPurchase = (): void => {
    if (!confirming) return;
    const heading = nameRefs.current.get(confirming.id) ?? null;
    void act(confirming);
    setConfirming(null);
    if (heading) requestAnimationFrame(() => heading.focus());
  };

  return (
    <>
      <div className={styles.wallet}>
        <span className={styles.walletValue}>◈ {deck.hero.coins.toLocaleString()}</span>
        <span className={styles.walletNote}>Coins come from kept quests and crowns. They cannot be bought, and nothing here changes how the game plays.</span>
      </div>
      {anyShort ? <p className={styles.walletNote}>Cosmetics you can’t yet afford wait here until your balance reaches them.</p> : null}

      <div className={styles.cards}>
        {deck.cosmetics.map(cosmetic => {
          const owned = cosmetic.state === 'equipped' || cosmetic.state === 'owned';
          const actionable = cosmetic.state === 'owned' || cosmetic.state === 'affordable';
          return (
            <Card key={cosmetic.id} padding="md" selected={cosmetic.state === 'equipped'}>
              <Card.Body>
                <div className={styles.tile}>
                  <div className={styles.tileHead}>
                    <span className={styles.glyph} data-owned={owned} aria-hidden>
                      {cosmetic.glyph}
                    </span>
                    <h3
                      className={styles.tileName}
                      tabIndex={-1}
                      ref={el => {
                        if (el) nameRefs.current.set(cosmetic.id, el);
                      }}
                    >
                      {cosmetic.name}
                    </h3>
                    {cosmetic.state === 'equipped' ? (
                      <Badge variant="soft" intent="info" size="sm">
                        Equipped
                      </Badge>
                    ) : null}
                  </div>
                  <span className={styles.tileMeta}>{cosmetic.note}</span>
                  <div className={styles.tileAction}>
                    {cosmetic.state === 'starter' ? (
                      <span className={styles.tileMeta}>Starter crest</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={cosmetic.state === 'equipped' ? 'ghost' : 'secondary'}
                        disabled={actionable ? undefined : true}
                        loading={command.isPendingFor(cosmeticCommand(cosmetic))}
                        onClick={event => trigger(cosmetic, event.currentTarget)}
                      >
                        {ACTION_LABELS[cosmetic.state](cosmetic)}
                      </Button>
                    )}
                  </div>
                </div>
              </Card.Body>
            </Card>
          );
        })}
      </div>

      <OverlaySurface
        open={confirming !== null}
        onOpenChange={open => {
          if (!open) setConfirming(null);
        }}
        restoreFocusTo={restoreFocusTo}
        title={lastConfirming ? `Unlock ${lastConfirming.name}` : 'Unlock'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={lastConfirming ? command.isPendingFor(cosmeticCommand(lastConfirming)) : false} onClick={confirmPurchase}>
              Unlock
            </Button>
          </>
        }
      >
        {lastConfirming ? <p className={screenStyles.cardBody}>{`Unlock ${lastConfirming.name} for ${lastConfirming.priceCoins} ◈? You have ${deck.hero.coins}.`}</p> : null}
      </OverlaySurface>
    </>
  );
}

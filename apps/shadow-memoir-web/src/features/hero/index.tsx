import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function HeroScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Hero"
      summary="Level and position on the XP curve, the four lifetime stats, the achievements grid, earned titles and the cosmetics catalogue with the coin balance."
    />
  );
}

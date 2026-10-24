import { type ReactElement } from 'react';

import { type CatalogTab, CatalogWorkspace } from '@/features/catalog';

export function AdvancedScreen({ tab }: { tab: CatalogTab }): ReactElement {
  return <CatalogWorkspace tab={tab} />;
}

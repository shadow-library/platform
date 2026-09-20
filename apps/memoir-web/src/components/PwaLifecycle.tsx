import { type ReactElement } from 'react';
import { Banner } from '@shadow-library/ui';

import { useAppUpdate } from '@/lib/app-update';

export function PwaLifecycle(): ReactElement | null {
  const update = useAppUpdate();
  if (update.update !== 'waiting') return null;
  return <Banner intent="info" lead="Update ready." message="A new version of Memoir is available." action={{ label: 'Refresh', onClick: update.apply }} />;
}

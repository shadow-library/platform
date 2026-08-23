import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function SettingsScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Settings"
      summary="Appearance, currencies, intensity mode, notification preferences, AI consents, membership, sync status, data export and account deletion."
    />
  );
}

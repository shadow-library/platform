import { type ComponentPropsWithoutRef } from 'react';

export interface OrganisationSwitcherOption {
  id: string;
  name: string;
}

export interface OrganisationSwitcherProps extends ComponentPropsWithoutRef<'div'> {
  /** Every organisation the session may act in; fewer than two is no choice, so nothing renders. */
  organisations: readonly OrganisationSwitcherOption[];
  /** The organisation the session acts in now; nothing renders while it is unknown or not among `organisations`. */
  activeId?: string;
  /** Fires with the newly chosen organisation; the caller switches the session and reloads what was fetched under the old one. */
  onSwitch: (organisationId: string) => void;
  /** Locks the control behind a spinner while a switch is in flight. */
  switching?: boolean;
}

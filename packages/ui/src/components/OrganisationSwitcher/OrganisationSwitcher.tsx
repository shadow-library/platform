import { forwardRef } from 'react';

import { cn } from '@/lib';

import { Select } from '../Select';
import styles from './OrganisationSwitcher.module.css';
import { type OrganisationSwitcherProps } from './OrganisationSwitcher.types';

/** The top bar's organisation picker. Every permission is evaluated in the active organisation, so a switch changes what the whole app may do. */
export const OrganisationSwitcher = forwardRef<HTMLDivElement, OrganisationSwitcherProps>(function OrganisationSwitcher(
  { organisations, activeId, onSwitch, switching = false, className, ...props },
  ref,
) {
  if (organisations.length < 2 || !organisations.some(organisation => organisation.id === activeId)) return null;

  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      <Select value={activeId} onValueChange={onSwitch} disabled={switching} loading={switching} size="sm" aria-label="Active organisation">
        {organisations.map(organisation => (
          <Select.Item key={organisation.id} value={organisation.id}>
            {organisation.name}
          </Select.Item>
        ))}
      </Select>
    </div>
  );
});

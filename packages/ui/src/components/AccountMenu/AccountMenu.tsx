/**
 * Importing npm packages
 */
import { forwardRef, type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { DropdownMenu } from '../DropdownMenu';
import styles from './AccountMenu.module.css';
import { type AccountMenuProps } from './AccountMenu.types';

/**
 * Declaring the constants
 */
function SignOutIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6" />
      <path d="M10.5 11 14 8l-3.5-3M14 8H6" />
    </svg>
  );
}

/**
 * The one place a product shows who is signed in. It lives in the top bar's utility cluster and nowhere
 * else — an identity repeated in a sidebar footer is a second source of truth that drifts, and on a phone
 * it costs the nav its most reachable row.
 *
 * Signed-out is a distinct surface, not an empty menu: a reader who is only browsing gets a sign-in call
 * to action instead of an avatar with nothing behind it. Absence of `name` alone never triggers it, since
 * a profile fetch can fail while the session is perfectly valid.
 */
export const AccountMenu = forwardRef<HTMLDivElement, AccountMenuProps>(function AccountMenu(
  { name, email, src, items, onSignOut, signOutLabel = 'Sign out', signedOut, className, ...props },
  ref,
) {
  if (signedOut != null) {
    return (
      <div ref={ref} className={cn(styles.root, className)} {...props}>
        <Button variant="primary" size="sm" asChild>
          <a href={signedOut.href}>{signedOut.label ?? 'Sign in'}</a>
        </Button>
      </div>
    );
  }

  const displayName = name ?? 'Account';
  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={styles.trigger} aria-label="Account menu">
            <Avatar name={displayName} src={src} size="sm" alt="" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={6} className={styles.menu}>
          <DropdownMenu.Label className={styles.header}>
            <span className={styles.headerName}>{displayName}</span>
            {email != null ? <span className={styles.headerEmail}>{email}</span> : null}
          </DropdownMenu.Label>
          {items != null && items.length > 0 ? (
            <>
              <DropdownMenu.Separator />
              {items.map(item => (
                <DropdownMenu.Item key={item.id} icon={item.icon} destructive={item.destructive} disabled={item.disabled} onSelect={item.onSelect}>
                  {item.label}
                </DropdownMenu.Item>
              ))}
            </>
          ) : null}
          {onSignOut != null ? (
            <>
              <DropdownMenu.Separator />
              <DropdownMenu.Item icon={<SignOutIcon />} destructive onSelect={onSignOut}>
                {signOutLabel}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
});

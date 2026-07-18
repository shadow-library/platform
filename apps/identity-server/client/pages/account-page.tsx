/**
 * Importing npm packages
 */
import { type ReactElement, useEffect, useState } from 'react';
import { Badge, Button, Card, Tabs } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { ContactsSection } from '../components/account/contacts-section';
import { SecuritySection } from '../components/account/security-section';
import { SessionsSection } from '../components/account/sessions-section';
import { StepUpProvider } from '../components/account/step-up';
import { BrandMark } from '../components/auth-shell';
import { api, type Me } from '../lib/api';
import { isLoggedIn } from '../lib/context';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function AccountPage(): ReactElement {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return window.location.replace('/login');
    api
      .me()
      .then(setMe)
      .catch(() => window.location.replace('/login'));
  }, []);

  const signout = async (): Promise<void> => {
    await api.signout().catch(() => undefined);
    window.location.assign('/login');
  };

  const displayName = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') || me.email || 'your account' : '…';

  return (
    <StepUpProvider>
      <header className="account-shell__header">
        <BrandMark />
        <div className="cluster gap-12">
          <span className="text-secondary">{displayName}</span>
          {me ? <Badge variant="outline">{me.aal}</Badge> : null}
          <Button variant="ghost" size="sm" onClick={() => void signout()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="container">
        <div className="stack gap-24">
          <Card padding="lg">
            <Card.Header title={`Welcome, ${displayName}`} />
            <Card.Body>
              <p className="text-secondary">Manage how you sign in to every shadow-apps.com service: verification factors, active sessions, and the addresses that reach you.</p>
            </Card.Body>
          </Card>

          <Tabs defaultValue="security">
            <Tabs.List aria-label="Account sections">
              <Tabs.Tab value="security">Security</Tabs.Tab>
              <Tabs.Tab value="sessions">Sessions</Tabs.Tab>
              <Tabs.Tab value="contacts">Emails &amp; phones</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="security">
              <SecuritySection />
            </Tabs.Panel>
            <Tabs.Panel value="sessions">
              <SessionsSection />
            </Tabs.Panel>
            <Tabs.Panel value="contacts">
              <ContactsSection />
            </Tabs.Panel>
          </Tabs>
        </div>
      </main>
    </StepUpProvider>
  );
}

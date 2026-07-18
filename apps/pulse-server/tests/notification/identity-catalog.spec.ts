/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { and, eq, isNull } from 'drizzle-orm';
import mustache from 'mustache';

/**
 * Importing user defined packages
 */
import { PULSE_SCOPES } from '@modules/auth';
import { type Notification, schema } from '@server/database';
import { IDENTITY_CLIENT_ID, TEST_REGEX, TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

interface CatalogEntry {
  templateKey: string;
  channels: Notification.Channel[];
  payload: Record<string, unknown>;
  fragments: string[];
}

interface ChannelResult {
  channel: Notification.Channel;
  status: string;
  locale?: string;
  jobId?: string;
}

interface SendResult {
  status: string;
  channelResults: ChannelResult[];
}

/**
 * Declaring the constants
 */
const testEnv = new TestEnvironment('identity_catalog_test');

/** The service name identity-server stamps on every notification (its `notification.service-name` config) */
const IDENTITY_SERVICE = 'shadow-identity';
const EMAIL_RECIPIENT = 'user@shadow.test';
const PHONE_RECIPIENT = '+919876543210';
const DEFAULT_LOCALE = 'en-ZZ';

/** Every template key identity-server can send, each with a payload shaped exactly like the sending call site constructs it */
const IDENTITY_CATALOG: CatalogEntry[] = [
  { templateKey: 'auth.register.otp', channels: ['EMAIL', 'SMS'], payload: { code: '482913' }, fragments: ['482913'] },
  { templateKey: 'auth.login.otp', channels: ['EMAIL', 'SMS'], payload: { code: '175306' }, fragments: ['175306'] },
  { templateKey: 'auth.recovery.otp', channels: ['EMAIL'], payload: { code: '930127' }, fragments: ['930127'] },
  { templateKey: 'auth.password.changed', channels: ['EMAIL'], payload: { ipAddress: '203.0.113.7' }, fragments: ['203.0.113.7'] },
  { templateKey: 'auth.mfa.enrolled', channels: ['EMAIL'], payload: { method: 'TOTP' }, fragments: ['TOTP'] },
  { templateKey: 'auth.mfa.disabled', channels: ['EMAIL'], payload: { method: 'WEBAUTHN' }, fragments: ['WEBAUTHN'] },
  { templateKey: 'auth.mfa.recovery-code-used', channels: ['EMAIL'], payload: { remaining: 4 }, fragments: ['4 recovery codes'] },
  {
    templateKey: 'security.new-signin',
    channels: ['EMAIL'],
    payload: { ipAddress: '203.0.113.7', userAgent: 'Chrome on macOS', time: '2026-07-18T10:15:00.000Z' },
    fragments: ['203.0.113.7', 'Chrome on macOS', '2026-07-18T10:15:00.000Z'],
  },
  { templateKey: 'user.email.verification', channels: ['EMAIL'], payload: { code: '648201' }, fragments: ['648201'] },
  { templateKey: 'user.phone.verification', channels: ['SMS'], payload: { code: '507934' }, fragments: ['507934'] },
  { templateKey: 'user.contact.changed', channels: ['EMAIL'], payload: { action: 'primary-changed', type: 'email' }, fragments: ['email', 'primary-changed'] },
  {
    templateKey: 'organisation-invitation',
    channels: ['EMAIL'],
    payload: { organisationName: 'Acme Corp', role: 'ADMIN', token: 'inv-4f9d8a7b2c31' },
    fragments: ['Acme Corp', 'ADMIN', 'inv-4f9d8a7b2c31'],
  },
  { templateKey: 'organisation-role-changed', channels: ['EMAIL'], payload: { role: 'MEMBER' }, fragments: ['MEMBER'] },
  { templateKey: 'organisation-member-removed', channels: ['EMAIL'], payload: {}, fragments: [] },
];

describe('Identity notification catalog', () => {
  testEnv.init();

  it('should queue every identity template key sent over the identity M2M contract', async () => {
    const headers = await testEnv.serviceHeaders({ clientId: IDENTITY_CLIENT_ID, scopes: [PULSE_SCOPES.notificationsSend] });

    for (const entry of IDENTITY_CATALOG) {
      const recipients: Record<string, string> = {};
      if (entry.channels.includes('EMAIL')) recipients.email = EMAIL_RECIPIENT;
      if (entry.channels.includes('SMS')) recipients.phone = PHONE_RECIPIENT;

      const body = { templateKey: entry.templateKey, recipients, payload: entry.payload, service: IDENTITY_SERVICE };
      const response = await testEnv.getRouter().mockRequest().headers(headers).post('/api/v1/notifications').body(body);

      expect(response.statusCode).toBe(201);
      const result: SendResult = response.json();
      expect(result.status).toBe('ACCEPTED');
      expect([...result.channelResults.map(channelResult => channelResult.channel)].sort()).toEqual([...entry.channels].sort());
      for (const channelResult of result.channelResults) {
        expect(channelResult).toEqual({ channel: expect.any(String), status: 'QUEUED', locale: DEFAULT_LOCALE, jobId: expect.stringMatching(TEST_REGEX.uuid) });
      }
    }
  });

  it('should render an active en-ZZ variant for every identity template key and channel', async () => {
    const db = testEnv.getPostgresClient();

    for (const entry of IDENTITY_CATALOG) {
      const group = await db.query.templateGroups.findFirst({
        where: eq(schema.templateGroups.templateKey, entry.templateKey),
        with: { variants: true, channelSettings: true },
      });
      expect(group?.isActive).toBe(true);

      for (const channel of entry.channels) {
        const setting = group?.channelSettings.find(channelSetting => channelSetting.channel === channel);
        expect(setting?.isEnabled).toBe(true);

        const variant = group?.variants.find(templateVariant => templateVariant.channel === channel && templateVariant.locale === DEFAULT_LOCALE);
        expect(variant?.isActive).toBe(true);
        if (!variant) continue;

        if (channel === 'EMAIL') expect(variant.subject).toBeTruthy();

        /** Rendered exactly as NotificationProviderService renders before handing the message to a provider */
        const rendered = `${mustache.render(variant.subject ?? 'NA', entry.payload)}\n${mustache.render(variant.body, entry.payload)}`;
        expect(rendered).not.toContain('{{');
        for (const fragment of entry.fragments) expect(rendered).toContain(fragment);
      }
    }
  });

  it('should back the catch-all routing rule with active DEV endpoints for every identity channel', async () => {
    const db = testEnv.getPostgresClient();

    const catchAll = await db.query.senderRoutingRules.findFirst({
      where: and(isNull(schema.senderRoutingRules.service), isNull(schema.senderRoutingRules.region), isNull(schema.senderRoutingRules.messageType)),
    });
    expect(catchAll).toBeDefined();
    if (!catchAll) return;

    const endpoints = await db.query.senderEndpoints.findMany({ where: eq(schema.senderEndpoints.senderProfileId, catchAll.senderProfileId) });
    const identityChannels = new Set(IDENTITY_CATALOG.flatMap(entry => entry.channels));
    for (const channel of identityChannels) {
      expect(endpoints.some(endpoint => endpoint.channel === channel && endpoint.isActive && endpoint.provider === 'DEV')).toBe(true);
    }
  });
});

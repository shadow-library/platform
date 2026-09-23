/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

/**
 * Importing user defined packages
 */
import { pulseDb, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import { createPublishedTemplate, insertNotificationJob, insertNotificationMessage } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `GET /api/v1/notifications/messages` is the dev-only message log (`@EnableIf(app.stage === 'dev')` plus
 * `pulse:messages:read`). Its rows are arranged by writing the `notification_jobs` + `notification_messages` pair
 * `DevNotificationProvider` writes, because every send route into pulse is gated on the service-only
 * `notifications:send` scope no host-side caller can hold (see `security.spec.ts`).
 *
 * `pulse:messages:read` is declared by pulse but missing from identity's dev catalogue — identity's
 * `EcosystemSeedService.reconcileApplication` never adds a permission declared after its application exists — so
 * `createPulseStaff` creates the catalogue row with the test's role and removes it again afterwards.
 */

/** Every field `NotificationService.listMessages` projects; anything else on an item would be a leak. */
const MESSAGE_FIELDS = ['id', 'createdAt', 'recipient', 'channel', 'locale', 'templateKey', 'messageType'];

interface MessageItem {
  id: string;
  recipient: string;
  channel: string;
  templateKey: string;
}

/** `utils.string.mask`'s default shape: the first and last character survive, everything between is starred. */
function masked(recipient: string): string {
  return `${recipient[0]}${'*'.repeat(recipient.length - 2)}${recipient.at(-1)}`;
}

test.describe('notification message log', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should require pulse:messages:read specifically — a caller holding only pulse:logs:read is refused 403 IAM_002', async ({ pulse }) => {
    const logsOnly = await pulse.staff({ label: 'logs-only', permissions: ['pulse:logs:read'] });
    const reader = await pulse.staff({ label: 'messages-read', permissions: ['pulse:messages:read'] });

    const refused = await logsOnly.ctx.get('/api/v1/notifications/messages?limit=1');
    expect(refused.status()).toBe(403);
    expect((await refused.json()) as { code?: string }).toMatchObject({ code: 'IAM_002' });

    const admitted = await reader.ctx.get('/api/v1/notifications/messages?limit=1');
    expect(admitted.status(), await admitted.text()).toBe(200);
    expect((await admitted.json()) as { items: unknown[] }).toHaveProperty('items');
  });

  test('should return delivery metadata only, with the recipient masked even when filtered by its raw value', async ({ pulse }) => {
    const admin = await pulse.admin();
    const reader = await pulse.staff({ label: 'messages-shape', permissions: ['pulse:messages:read'] });
    const template = await createPublishedTemplate(admin, 'msg-shape');
    pulse.trackTemplate(template.id);

    const recipient = `e2e.msglog.${randomBytes(6).toString('hex')}@shadow-apps.test`;
    const renderedBody = `E2E rendered body ${randomBytes(8).toString('hex')}`;
    const renderedSubject = `E2E rendered subject ${randomBytes(4).toString('hex')}`;
    // Dated outside the dashboard's seven-day trend window, so this row cannot move the counts `dashboard.spec.ts`
    // asserts a delta on while the two run side by side. The message log itself is not date-filtered.
    const queuedAt = new Date(Date.now() - 30 * 86_400_000);
    const jobId = await insertNotificationJob({ templateId: template.id, templateVersionId: template.versionId, channel: 'EMAIL', recipient, status: 'SENT', createdAt: queuedAt });
    pulse.trackJobs(jobId);
    const messageId = await insertNotificationMessage(jobId, { renderedBody, renderedSubject });

    const stored = await pulseDb()<{ renderedBody: string }[]>`SELECT rendered_body AS "renderedBody" FROM notification_messages WHERE id = ${messageId}`;
    expect(stored[0]?.renderedBody, 'the rendered content is what the API must withhold, so it has to exist').toBe(renderedBody);

    const response = await reader.ctx.get(`/api/v1/notifications/messages?recipient=${encodeURIComponent(recipient)}`);
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json()) as { total: number; items: MessageItem[] };
    expect(body.total, 'the filter matches on the raw recipient the job was queued with').toBe(1);

    const item = body.items[0] as MessageItem;
    expect(item.id).toBe(messageId);
    expect(item.templateKey).toBe(template.templateKey);
    expect(item.channel).toBe('EMAIL');
    expect(item.recipient).toBe(masked(recipient));
    expect(Object.keys(item).sort()).toEqual([...MESSAGE_FIELDS].sort());
    const raw = await response.text();
    expect(raw).not.toContain(renderedBody);
    expect(raw).not.toContain(renderedSubject);
    expect(raw, 'the unmasked address never reaches the response either').not.toContain(recipient);

    const byMask = await reader.ctx.get(`/api/v1/notifications/messages?recipient=${encodeURIComponent(masked(recipient))}`);
    expect(byMask.status()).toBe(200);
    expect(((await byMask.json()) as { total: number }).total, 'the masked form is a display value, not a queryable one').toBe(0);
  });
});

import { describe, expect, it } from 'bun:test';

import { buildRenderGlobals, resolvePayload, TemplateEngineService } from '@modules/template';
import { BASELINE_TEMPLATES } from '@server/database/seed/baseline.data';

/**
 * Every template key identity-server sends, declared there as `*_TEMPLATE` constants beside their callers
 * (`rg "const \w*TEMPLATE\w* = '" apps/identity-server/src`). Add a key here when identity adds one: this test then fails until the baseline
 * has its fixture, marked `producer: 'identity'` so the console send refuses it.
 */
const IDENTITY_TEMPLATE_KEYS = [
  'auth.login.otp',
  'auth.mfa.disabled',
  'auth.mfa.enrolled',
  'auth.mfa.recovery-code-used',
  'auth.password.changed',
  'auth.recovery.otp',
  'auth.register.otp',
  'bot.key.expiring',
  'organisation-invitation',
  'organisation-member-removed',
  'organisation-member-status-changed',
  'organisation-role-changed',
  'security.new-signin',
  'user.contact.changed',
  'user.email.verification',
  'user.phone.verification',
];

describe('identity templates in the baseline', () => {
  it.each(IDENTITY_TEMPLATE_KEYS)('should seed %s as a template identity produces', templateKey => {
    expect(BASELINE_TEMPLATES.find(fixture => fixture.templateKey === templateKey)?.producer).toBe('identity');
  });

  it('should mark no baseline template as identity-produced beyond what identity sends', () => {
    const marked = BASELINE_TEMPLATES.filter(fixture => fixture.producer === 'identity').map(fixture => fixture.templateKey);
    expect(marked.sort()).toEqual(IDENTITY_TEMPLATE_KEYS);
  });
});

describe('organisation-member-status-changed', () => {
  const fixture = BASELINE_TEMPLATES.find(candidate => candidate.templateKey === 'organisation-member-status-changed');
  const email = fixture?.channels.find(content => content.channel === 'EMAIL');

  async function render(payload: Record<string, unknown>): Promise<{ subject: string | null; body: string }> {
    if (!fixture || !email) throw new Error('fixture missing');
    const data = { ...buildRenderGlobals(), ...resolvePayload({ variables: fixture.variables }, payload) };
    return new TemplateEngineService().render({ channel: 'EMAIL', subject: email.subject ?? null, body: email.body, layout: null, partials: {}, data });
  }

  it('should tell a suspended member why, when identity gives a reason', async () => {
    const rendered = await render({ status: 'SUSPENDED', reason: 'Pending a security review' });

    expect(rendered.subject).toBe('Your organisation access was paused');
    expect(rendered.body).toContain('suspended');
    expect(rendered.body).toContain('Pending a security review');
  });

  it('should render a hold without a reason, as identity sends it with reason null', async () => {
    const rendered = await render({ status: 'BLOCKED', reason: null });

    expect(rendered.body).toContain('blocked');
    expect(rendered.body).not.toContain('Reason given');
  });

  it('should tell a reinstated member their access is back', async () => {
    const rendered = await render({ status: 'ACTIVE', reason: null });

    expect(rendered.subject).toBe('Your organisation access was restored');
    expect(rendered.body).toContain('active again');
  });
});

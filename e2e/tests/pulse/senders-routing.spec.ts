/**
 * Importing npm packages
 */
import { expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, mutate, requireProductUrl } from '../../lib';
import { createRoutingRule, createSenderEndpoint, createSenderProfile, deleteRoutingRule, deleteSenderProfile, findRoutingRuleId, uniqueKey } from './helpers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Request-level coverage of `apps/pulse-server/src/modules/configuration/*` (sender profiles, endpoints,
 * routing rules), driven as `admin` (PulseAdmin holds `pulse:senders:write`/`read`). Every profile/rule this
 * file creates carries a `uniqueKey('...')` key or a distinct `service` tag and is deleted at the end of the
 * test that created it — nothing here touches the seeded `e2e-dev` profile, its DEV endpoints, or the
 * all-NULL catch-all routing rule.
 */
test.describe('sender & routing CRUD', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should create a sender profile, fetch it, and reject a duplicate endpoint with SND_EP_002', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const key = uniqueKey('sender');

    const profile = await createSenderProfile(ctx, { key, displayName: 'E2E Sender', isActive: true });
    expect(profile.key).toBe(key);

    const getResponse = await ctx.get(`/api/v1/sender-profiles/${profile.id}`);
    expect(getResponse.status()).toBe(200);
    const getBody = (await getResponse.json()) as { key: string };
    expect(getBody.key).toBe(key);

    const identifier = `${key}@shadow-apps.test`;
    const firstEndpoint = await createSenderEndpoint(ctx, profile.id, { channel: 'EMAIL', provider: 'DEV', identifier, isActive: true });
    expect(firstEndpoint.status()).toBe(201);

    const duplicateEndpoint = await createSenderEndpoint(ctx, profile.id, { channel: 'EMAIL', provider: 'DEV', identifier, isActive: true });
    expect(duplicateEndpoint.status()).toBe(409);
    const duplicateBody = (await duplicateEndpoint.json()) as { code?: string };
    expect(duplicateBody.code).toBe('SND_EP_002');

    // Cleanup: the endpoint cascades off the profile delete (sender_endpoints FK is ON DELETE CASCADE per the DB report).
    const deleted = await deleteSenderProfile(ctx, profile.id);
    expect(deleted.status()).toBe(204);
  });

  test('should create a routing rule, reject a duplicate (service,region,messageType) with SND_RTR_002, and delete it', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const key = uniqueKey('routing-sender');
    const profile = await createSenderProfile(ctx, { key, isActive: true });
    const service = uniqueKey('e2e-svc');

    const created = await createRoutingRule(ctx, { senderProfileId: profile.id, service, region: 'US', messageType: 'TRANSACTIONAL' });
    expect(created.status()).toBe(201);

    const duplicate = await createRoutingRule(ctx, { senderProfileId: profile.id, service, region: 'US', messageType: 'TRANSACTIONAL' });
    expect(duplicate.status()).toBe(409);
    const duplicateBody = (await duplicate.json()) as { code?: string };
    expect(duplicateBody.code).toBe('SND_RTR_002');

    const routingRuleId = await findRoutingRuleId(profile.id, service, 'US', 'TRANSACTIONAL');
    const deletedRule = await deleteRoutingRule(ctx, routingRuleId);
    expect(deletedRule.status()).toBe(204);

    const deletedProfile = await deleteSenderProfile(ctx, profile.id);
    expect(deletedProfile.status()).toBe(204);
  });

  test('should return the routing rule id on create, list and get, and address the rule by it', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const profile = await createSenderProfile(ctx, { key: uniqueKey('routing-id'), isActive: true });
    const service = uniqueKey('svc-id');
    try {
      const created = await createRoutingRule(ctx, { senderProfileId: profile.id, service });
      expect(created.status()).toBe(201);
      const { id } = (await created.json()) as { id?: string };
      expect(id).toEqual(await findRoutingRuleId(profile.id, service));

      const listed = await ctx.get('/api/v1/sender-routing-rules', { params: { serviceName: service } });
      expect(((await listed.json()) as { items: { id?: string }[] }).items.map(rule => rule.id)).toEqual([id]);
      const fetched = await ctx.get(`/api/v1/sender-routing-rules/${id}`);
      expect(((await fetched.json()) as { id?: string }).id).toBe(id);

      expect((await deleteRoutingRule(ctx, id ?? '')).status()).toBe(204);
      expect((await ctx.get(`/api/v1/sender-routing-rules/${id}`)).status()).toBe(404);
    } finally {
      const leftover = await findRoutingRuleId(profile.id, service).catch(() => undefined);
      if (leftover) await deleteRoutingRule(ctx, leftover);
      await deleteSenderProfile(ctx, profile.id);
    }
  });

  test('should reject a routing rule against an inactive sender profile with SND_RTR_003', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const key = uniqueKey('routing-inactive');
    const profile = await createSenderProfile(ctx, { key, isActive: false });

    const response = await createRoutingRule(ctx, { senderProfileId: profile.id, service: uniqueKey('svc-inactive') });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('SND_RTR_003');

    await deleteSenderProfile(ctx, profile.id);
  });

  test('should reject deleting a sender profile that still has a routing rule with SND_PRF_003', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const key = uniqueKey('routing-guard');
    const profile = await createSenderProfile(ctx, { key, isActive: true });
    const service = uniqueKey('e2e-svc-guard');
    await createRoutingRule(ctx, { senderProfileId: profile.id, service });

    const blocked = await deleteSenderProfile(ctx, profile.id);
    expect(blocked.status()).toBe(409);
    const blockedBody = (await blocked.json()) as { code?: string };
    expect(blockedBody.code).toBe('SND_PRF_003');

    // Clean up in the order the API demands: rule first, profile second.
    const routingRuleId = await findRoutingRuleId(profile.id, service);
    await deleteRoutingRule(ctx, routingRuleId);
    const deletedProfile = await deleteSenderProfile(ctx, profile.id);
    expect(deletedProfile.status()).toBe(204);
  });

  // Confirmed live: a non-numeric id fails the route param's `^[0-9]+$` pattern at the class-schema validation
  // layer, which 422s `VALIDATION_ERROR` — not the 400 this suite was briefed to expect (that assumption traced
  // to `S006`/Fastify's own default, which would apply to a raw Ajv failure; class-schema's own validator wins
  // first here and always answers 422 on this stack, matching every other malformed-body case in this suite).
  test('should 422 a non-numeric id in a sender-profile URL', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await ctx.get('/api/v1/sender-profiles/not-a-number');
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('should 422 a non-numeric id in a routing-rule URL', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await ctx.get('/api/v1/sender-routing-rules/not-a-number');
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('should 404 SND_PRF_001 for an unknown (but numeric) sender profile id', async () => {
    const ctx = await apiContext('pulse', 'admin');
    const response = await ctx.get('/api/v1/sender-profiles/999999999');
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('SND_PRF_001');
  });

  test('should reject an unauthenticated mutation to sender-profiles', async () => {
    const ctx = await apiContext('pulse');
    const response = await mutate(ctx, 'post', '/api/v1/sender-profiles', { data: { key: uniqueKey('anon') } });
    expect(response.status()).toBe(401);
  });
});

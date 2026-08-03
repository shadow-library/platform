/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIRequestContext, type BrowserContext, expect, test } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, identityDb, PERSONAS, readSeedManifest, requireProductUrl, webNovelDb } from '../../lib';
import { pollOtp } from '../identity/helpers';
import { loginIdentity, scopedMutate } from './helpers';

/**
 * Defining types
 */

interface FlowState {
  readonly flowId: string;
  readonly status: string;
}

/**
 * Declaring the constants
 *
 * The organisation-access story, driven end to end against the deployed cluster: a brand-new user registers
 * (spending one `register/init`), creates an organisation (becoming its OWNER), is denied a Pulse session
 * (Pulse is an INTERNAL identity application no ordinary user may reach), then invites a seeded persona who
 * accepts into the org. The pay-off is web-novel's ORGANISATION-visibility gate, resolved through identity's
 * real internal membership call: an accepted member reads the org novel (200); a non-member and a guest cannot
 * tell it from a novel that does not exist (404 WBN_001). It closes by re-confirming the seeded RESTRICTED novel.
 *
 * Serial, because every step feeds the next (register → org → invite → accept → visibility) and the two
 * rate-limited spends (`register/init` 5/hour, `login/init` 20/hour) are guarded with `test.skip` on 429 so a
 * poisoned shared budget skips cleanly instead of failing.
 */

/** A password that satisfies identity's policy: ≥12 chars, upper + lower + number + symbol. */
const OWNER_PASSWORD = 'E2eOrgChk#Passw0rd!';

/** The outbox template identity enqueues an organisation invitation under; its payload carries the raw accept token. */
const INVITE_TEMPLATE = 'organisation-invitation';

/** The outbox template the registration OTP is enqueued under. */
const REGISTER_OTP_TEMPLATE = 'auth.register.otp';

/** SHA-256 hex of a chapter body — the shape web-novel stores as `content_hash`. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Reads the newest invitation token identity enqueued for `email`, polling briefly since the outbox row is
 * written transactionally with the invite. Uses the `#>> '{}'` unwrap so it survives whether identity stored
 * the payload as a proper jsonb object or as the double-encoded jsonb string scalar the OTP path still exhibits.
 */
async function pollInviteToken(email: string, timeoutMs = 8_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await identityDb()<{ token: string | null }[]>`
      SELECT ((payload #>> '{}')::jsonb) ->> 'token' AS token
      FROM notification_outbox
      WHERE ((recipients #>> '{}')::jsonb) ->> 'email' = ${email} AND template_key = ${INVITE_TEMPLATE}
      ORDER BY id DESC
      LIMIT 1
    `;
    const token = rows[0]?.token ?? undefined;
    if (token) return token;
    if (Date.now() >= deadline) throw new Error(`No ${INVITE_TEMPLATE} token for ${email} within ${timeoutMs}ms`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/** Posts a registration step over `ctx` and returns the parsed `{flowId,status}`, asserting a 200 with a pointed message. */
async function registerStep(ctx: APIRequestContext, identityUrl: string, path: string, data: Record<string, unknown>): Promise<FlowState> {
  const response = await ctx.post(`${identityUrl}/api/v1/auth/${path}`, { data });
  expect(response.status(), `register/${path} should succeed — body ${await response.text()}`).toBe(200);
  return (await response.json()) as FlowState;
}

test.describe.configure({ mode: 'serial' });

test.describe('organisation access and ORGANISATION-visibility', () => {
  const identityUrl = requireProductUrl('identity');
  const pulseUrl = requireProductUrl('pulse');
  const { webNovel } = readSeedManifest();

  // Shared, built up across the serial steps.
  let ownerContext: BrowserContext;
  let ownerEmail: string;
  let orgId: string;
  const orgNovelSlug = `e2e-org-novel-${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
    ownerEmail = `e2e.orgcheck.${Date.now()}@shadow-apps.test`;
  });

  test.afterAll(async () => {
    // The org novel + its chapters are the only rows this spec owns and can cleanly remove (chapters cascade
    // on novel_id). The created organisation and registered user persist — identity has no easy delete — but
    // both are timestamp-unique per run, so they never collide with a later run.
    await webNovelDb()`DELETE FROM novels WHERE slug = ${orgNovelSlug}`;
    await ownerContext.close();
  });

  test('should register a brand-new user end to end and mint an identity session', async () => {
    test.setTimeout(60_000);
    const ctx = ownerContext.request;

    // Step 1 — email. A 429 here is the sticky 5/hour register/init budget, shared across the suite; skip, don't fail.
    const init = await ctx.post(`${identityUrl}/api/v1/auth/register/init`, { data: { email: ownerEmail } });
    test.skip(init.status() === 429, 'register/init hit the 5/hour rate limit — skipping rather than failing on a shared budget');
    expect(init.status(), `register/init for ${ownerEmail} — body ${await init.text()}`).toBe(200);
    const initBody = (await init.json()) as FlowState;
    expect(initBody.status).toBe('AWAITING_EMAIL_OTP');

    // Step 2 — email OTP, read back from the outbox (identity sends no mail in dev).
    const code = await pollOtp(ownerEmail, REGISTER_OTP_TEMPLATE);
    const afterOtp = await registerStep(ctx, identityUrl, 'challenge/verify', { flowId: initBody.flowId, code });
    expect(afterOtp.status, 'OTP verify should advance to the demographics step').toBe('AWAITING_DEMOGRAPHICS');

    // Step 3 — demographics (optional fields omitted) then profile (both names required).
    const afterDemographics = await registerStep(ctx, identityUrl, 'register/demographics', { flowId: initBody.flowId });
    expect(afterDemographics.status).toBe('AWAITING_PROFILE');
    const afterProfile = await registerStep(ctx, identityUrl, 'register/profile', { flowId: initBody.flowId, firstName: 'Org', lastName: 'Owner' });
    expect(afterProfile.status).toBe('AWAITING_PASSWORD_SET');

    // Step 4 — password completes registration and sets the identity session cookies on this browser context.
    const password = await ctx.post(`${identityUrl}/api/v1/auth/register/password`, { data: { flowId: initBody.flowId, password: OWNER_PASSWORD } });
    expect(password.status(), `register/password — body ${await password.text()}`).toBe(200);
    expect(((await password.json()) as FlowState).status).toBe('COMPLETED');

    // Proof of a live session: the authenticated self endpoint answers 200 off the freshly-minted __Host-sid.
    const me = await ctx.get(`${identityUrl}/api/v1/me/organisations`);
    expect(me.status(), 'the new session should authenticate against /api/v1/me').toBe(200);
  });

  test('should create an organisation as the new user, who becomes its OWNER', async () => {
    const slug = `e2e-org-${Date.now()}`;
    const response = await scopedMutate(ownerContext.request, identityUrl, 'post', '/api/v1/organisations', {
      data: { name: 'E2E Org Access Check', slug },
      seedPath: '/api/v1/me',
    });
    expect(response.status(), `create organisation — body ${await response.text()}`).toBe(201);
    const org = (await response.json()) as { id: string; slug: string; type: string };
    expect(org.slug).toBe(slug);
    expect(org.type, 'a created organisation is a TEAM org').toBe('TEAM');
    orgId = org.id;
    expect(orgId, 'the organisation id drives every downstream membership check').toBeTruthy();
  });

  test('should deny the non-staff user a Pulse session while the admin keeps one (INTERNAL app)', async () => {
    test.setTimeout(60_000);
    const page = await ownerContext.newPage();
    try {
      // The real browser SSO path: the new user, logged in at identity, tries to enter Pulse. Pulse is an
      // INTERNAL identity application, so identity refuses the OIDC hop (an ungranted INTERNAL app reads as an
      // unknown application → APP_006) and no Pulse session is ever established.
      const nav = await page.goto(`${pulseUrl}/api/auth/login?return_to=/`, { waitUntil: 'load' });
      const finalUrl = page.url();
      console.info('[pulse-denial] goto status', nav?.status(), 'final url', finalUrl);

      // The load-bearing assertion: the context holds no authenticated Pulse session.
      const session = await ownerContext.request.get(`${pulseUrl}/api/auth/session`);
      expect(session.status(), `an ordinary user must not obtain a Pulse session — body ${await session.text()}`).toBe(401);

      // The denial must surface as an error/access-denied landing, never Pulse's authenticated app shell.
      expect(finalUrl, 'the denied SSO hop must not land on an authenticated Pulse route').toMatch(/error|denied|login|identity\.shadow-apps\.test/i);
    } finally {
      await page.close();
    }

    // Positive control: the admin persona holds PulseAdmin, so its saved storage state carries a live Pulse session.
    const adminCtx = await apiContext('pulse', 'admin');
    const adminSession = await adminCtx.get('/api/auth/session');
    expect(adminSession.status(), 'the PulseAdmin persona should have an authenticated Pulse session').toBe(200);
    await adminCtx.dispose();
  });

  test('should invite user1 and let them accept into the organisation', async () => {
    test.setTimeout(60_000);
    const user1 = PERSONAS.user1;

    // Invite (OWNER qualifies for the ADMIN-gated route). user1's seeded email is verified, which acceptance requires.
    const invite = await scopedMutate(ownerContext.request, identityUrl, 'post', `/api/v1/organisations/${orgId}/invitations`, {
      data: { email: user1.email, role: 'MEMBER' },
      seedPath: '/api/v1/me',
    });
    expect(invite.status(), `invite member — body ${await invite.text()}`).toBe(200);
    expect(((await invite.json()) as { success: boolean }).success).toBe(true);

    // The raw accept token travels only in the invitation notification; read it back from the identity outbox.
    const token = await pollInviteToken(user1.email);

    // Accept as user1: a fresh identity login (one login/init spend, 429-guarded inside loginIdentity), then the
    // self-service accept over user1's own session.
    const user1Identity = await apiContext('identity');
    try {
      await loginIdentity(user1Identity, identityUrl, user1.email, user1.password);
      const accept = await scopedMutate(user1Identity, identityUrl, 'post', '/api/v1/me/invitations/accept', {
        data: { token },
        seedPath: '/api/v1/me',
      });
      expect(accept.status(), `accept invitation — body ${await accept.text()}`).toBe(200);
      expect(((await accept.json()) as { id: string }).id, 'accepting returns the organisation just joined').toBe(orgId);
    } finally {
      await user1Identity.dispose();
    }
  });

  // Seeds the ORGANISATION-visibility novel (normally a forge-owned tier) bound to the org just created, with one
  // published chapter. Runs first so the member-read fixme below can rely on the row existing once its bug is fixed.
  test('should hide the ORGANISATION novel from non-members, guests, and the public catalog', async () => {
    const [novel] = await webNovelDb()<{ id: string }[]>`
      INSERT INTO novels (slug, title, genres, status, visibility, organisation_id, revision)
      VALUES (${orgNovelSlug}, ${'E2E Org Novel'}, ${['Fantasy']}, 'live', 'ORGANISATION'::novel_visibility, ${orgId}, 1)
      RETURNING id::text AS id
    `;
    expect(novel, 'the org novel insert should return its id').toBeTruthy();
    const content = 'An organisation-only chapter, readable solely by members of the owning organisation.';
    await webNovelDb()`
      INSERT INTO published_chapters (novel_id, ordinal, title, content, content_hash, revision, word_count, published_at)
      VALUES (${novel!.id}, 1, ${'Chapter 1'}, ${content}, ${sha256(content)}, 1, ${content.split(' ').length}, now())
    `;

    // A non-member (user2, never in the org) must not be able to tell it from a novel that does not exist.
    const nonMemberCtx = await apiContext('webNovel', 'user2');
    const [nonMember, unknown] = await Promise.all([nonMemberCtx.get(`/api/novels/${orgNovelSlug}`), nonMemberCtx.get('/api/novels/e2e-does-not-exist')]);
    expect(nonMember.status(), 'a non-member must get a 404').toBe(404);
    const nonMemberBody = await nonMember.text();
    expect((JSON.parse(nonMemberBody) as { code?: string }).code).toBe('WBN_001');
    expect(nonMemberBody, 'the non-member 404 must be byte-identical to an unknown-slug 404').toBe(await unknown.text());

    // A guest is denied the same way (guests never even trigger a membership lookup — canRead short-circuits).
    const guestCtx = await apiContext('webNovel');
    const guestRead = await guestCtx.get(`/api/novels/${orgNovelSlug}`);
    expect(guestRead.status(), 'a guest must get a 404 for the org novel').toBe(404);
    expect(((await guestRead.json()) as { code?: string }).code).toBe('WBN_001');

    // The public catalog is PUBLIC-only: the org novel must never appear in it.
    const catalog = await guestCtx.get('/api/novels?limit=100');
    const catalogSlugs = ((await catalog.json()) as { items: { slug: string }[] }).items.map(item => item.slug);
    expect(catalogSlugs, 'an ORGANISATION novel must be absent from the PUBLIC catalog').not.toContain(orgNovelSlug);
  });

  /**
   * The crux of ORGANISATION visibility: a genuine org member reads the novel, going through web-novel's real
   * internal membership call to identity (`GET /api/v1/internal/organisations/:org/members/:sub`). This was
   * briefly broken — web-novel's `AuthClient.fetchService('identity-server', …)` resolved the bare, cross-namespace
   * `http://identity-server` and failed, so deny-by-default returned 404. Fixed by giving web-novel-server a
   * `SERVICE_URL_IDENTITY_SERVER=http://identity-server.identity` override so ServiceDiscovery resolves the
   * namespace-qualified host (mirroring the auth back-channel's AUTH_IDENTITY_URL).
   */
  test('should let an org MEMBER read the ORGANISATION novel through the identity internal membership call', async () => {
    const memberCtx = await apiContext('webNovel', 'user1');
    const memberRead = await memberCtx.get(`/api/novels/${orgNovelSlug}`);
    expect(memberRead.status(), `an accepted org member must read the ORGANISATION novel — body ${await memberRead.text()}`).toBe(200);
    expect(((await memberRead.json()) as { title?: string }).title, 'the member response carries the novel title').toBe('E2E Org Novel');
  });

  test('should re-confirm the seeded RESTRICTED novel gate (user1 granted, user2 and guest denied)', async () => {
    const grantedCtx = await apiContext('webNovel', 'user1');
    const granted = await grantedCtx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(granted.status(), 'user1 holds the seeded restricted grant').toBe(200);

    const ungrantedCtx = await apiContext('webNovel', 'user2');
    const ungranted = await ungrantedCtx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(ungranted.status(), 'user2 has no grant').toBe(404);
    expect(((await ungranted.json()) as { code?: string }).code).toBe('WBN_001');

    const guestCtx = await apiContext('webNovel');
    const guest = await guestCtx.get(`/api/novels/${webNovel.restrictedSlug}`);
    expect(guest.status(), 'a guest has no grant').toBe(404);
  });
});

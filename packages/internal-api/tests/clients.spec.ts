import { describe, expect, it } from 'bun:test';

import { IdentityClient } from '@shadow-library/internal-api/identity';
import { NovelForgeClient } from '@shadow-library/internal-api/novel-forge';
import { PULSE_TARGET, PulseClient } from '@shadow-library/internal-api/pulse';
import { FakeServiceFetch } from '@shadow-library/internal-api/testing';
import { WebNovelClient } from '@shadow-library/internal-api/web-novel';

describe('PulseClient', () => {
  it('should post a notification to pulse with the send scope', async () => {
    const fake = new FakeServiceFetch();
    await new PulseClient(fake.fetch).sendNotification({ templateKey: 'welcome', recipients: { email: 'a@example.test' }, payload: { name: 'A' } });

    expect(fake.calls[0]).toMatchObject({ url: 'http://pulse-server/api/v1/notifications', method: 'POST', token: { resource: 'api://pulse', scopes: ['notifications:send'] } });
    expect(fake.calls[0]?.body).toEqual({ templateKey: 'welcome', recipients: { email: 'a@example.test' }, payload: { name: 'A' } });
  });

  it('should mint for an overridden audience', async () => {
    const fake = new FakeServiceFetch();
    await new PulseClient(fake.fetch, { ...PULSE_TARGET, resource: 'api://pulse-staging' }).sendNotification({ templateKey: 'welcome', recipients: {} });

    expect(fake.calls[0]?.token.resource).toBe('api://pulse-staging');
  });
});

describe('IdentityClient', () => {
  it('should encode both ids into the membership path', async () => {
    const fake = new FakeServiceFetch();
    await new IdentityClient(fake.fetch).isOrganisationMember('12', '3/4');

    expect(fake.calls[0]).toMatchObject({ url: 'http://identity-server/api/v1/internal/organisations/12/members/3%2F4', method: 'GET' });
    expect(fake.calls[0]?.token).toEqual({ resource: 'shadow-identity', scopes: ['users:resolve'] });
  });
});

describe('NovelForgeClient', () => {
  it('should read and transfer bot ownership under the bots manage scope', async () => {
    const fake = new FakeServiceFetch();
    const client = new NovelForgeClient(fake.fetch);
    await client.getBotOwnership(9n);
    await client.transferBotOwnership(9n, { toUserId: '42' });

    expect(fake.calls.map(call => [call.method, call.url])).toEqual([
      ['GET', 'http://novel-forge-server/internal/bots/9/ownership'],
      ['POST', 'http://novel-forge-server/internal/bots/9/transfer'],
    ]);
    expect(fake.calls[1]?.body).toEqual({ toUserId: '42' });
    expect(fake.calls[0]?.token.scopes).toEqual(['novel-forge:bots:manage']);
  });
});

describe('WebNovelClient', () => {
  it('should address every publish route under the reader publish target', async () => {
    const fake = new FakeServiceFetch();
    const client = new WebNovelClient(fake.fetch);
    const chapter = { title: 'One', content: 'Prose.', contentHash: 'hash', revision: 1 };
    await client.upsertNovel('my-novel', { sourceRef: 'p1', title: 'T', visibility: 'PUBLIC', revision: 1 });
    await client.upsertAccess('my-novel', { visibility: 'PUBLIC', revision: 1 });
    await client.getAccess('my-novel');
    await client.upsertChapter('my-novel', 3, chapter);
    await client.deleteChapter('my-novel', 3);
    await client.getManifest('my-novel');
    await client.upsertWiki('my-novel', 'hero', { type: 'character', name: 'Hero', firstVisibleOrdinal: 1, contentHash: 'h', revision: 1, facets: [], images: [] });
    await client.deleteWiki('my-novel', 'hero');
    await client.getWikiManifest('my-novel');

    expect(fake.calls.map(call => `${call.method} ${call.url.replace('http://web-novel-server', '')}`)).toEqual([
      'PUT /internal/novels/my-novel',
      'PUT /internal/novels/my-novel/access',
      'GET /internal/novels/my-novel/access',
      'PUT /internal/novels/my-novel/chapters/3',
      'DELETE /internal/novels/my-novel/chapters/3',
      'GET /internal/novels/my-novel/manifest',
      'PUT /internal/novels/my-novel/wiki/hero',
      'DELETE /internal/novels/my-novel/wiki/hero',
      'GET /internal/novels/my-novel/wiki/manifest',
    ]);
    expect(new Set(fake.calls.map(call => JSON.stringify(call.token)))).toEqual(new Set([JSON.stringify({ resource: 'api://web-novel', scopes: ['web-novel:publish'] })]));
  });
});

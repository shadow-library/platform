import { afterAll, describe, expect, it } from 'bun:test';
import { type AuthAccessMode } from '@shadow-library/auth';
import { AuthAccessPolicy } from '@shadow-library/auth/module';
import { setConfig } from '@shadow-library/common/testing';

import { WikiController, type WikiRead, type WikiService } from '@modules/wiki';

import { anonymousContext, fakeRequest, FakeResponse } from '../fake-http';

const ETAG = '"wiki-etag"';
const SHARED = 'public, max-age=300';
const NO_STORE = 'private, no-store';

const restoreConfig = setConfig({ 'catalog.cache-max-age': 300 });
afterAll(restoreConfig);

function controllerFor(mode: AuthAccessMode, visibility: WikiRead<unknown>['visibility'], personalized: boolean): WikiController {
  const read = (): Promise<WikiRead<unknown>> => Promise.resolve({ body: { items: [] }, etag: ETAG, visibility, personalized });
  const wikiService = { listEntries: read, getEntry: read } as unknown as WikiService;
  return new WikiController(wikiService, anonymousContext, new AuthAccessPolicy(mode));
}

const READS = {
  listEntries: (controller: WikiController, response: FakeResponse, ifNoneMatch?: string) =>
    controller.listEntries({ slug: 'the-novel' }, fakeRequest(ifNoneMatch), response.asHttpResponse()),
  getEntry: (controller: WikiController, response: FakeResponse, ifNoneMatch?: string) =>
    controller.getEntry({ slug: 'the-novel', entryKey: 'hero' }, fakeRequest(ifNoneMatch), response.asHttpResponse()),
};

const CASES: { mode: AuthAccessMode; visibility: WikiRead<unknown>['visibility']; personalized: boolean; cacheControl: string }[] = [
  { mode: 'public', visibility: 'PUBLIC', personalized: false, cacheControl: SHARED },
  { mode: 'public', visibility: 'PUBLIC', personalized: true, cacheControl: NO_STORE },
  { mode: 'public', visibility: 'ORGANISATION', personalized: false, cacheControl: NO_STORE },
  { mode: 'private', visibility: 'PUBLIC', personalized: false, cacheControl: NO_STORE },
  { mode: 'private', visibility: 'PUBLIC', personalized: true, cacheControl: NO_STORE },
];

describe('WikiController', () => {
  for (const [read, run] of Object.entries(READS)) {
    for (const { mode, visibility, personalized, cacheControl } of CASES) {
      const reader = personalized ? 'a signed-in reader' : 'an anonymous reader';

      it(`should answer ${read} for ${reader} of a ${visibility} novel in ${mode} mode with '${cacheControl}'`, async () => {
        const response = new FakeResponse();
        await run(controllerFor(mode, visibility, personalized), response);

        expect(response.headers.get('cache-control')).toBe(cacheControl);
        expect(response.headers.get('vary')).toBe(cacheControl === SHARED ? undefined : 'Cookie, Authorization');
      });

      it(`should keep '${cacheControl}' on a 304 from ${read} for ${reader} of a ${visibility} novel in ${mode} mode`, async () => {
        const response = new FakeResponse();
        const body = await run(controllerFor(mode, visibility, personalized), response, ETAG);

        expect(body).toBeUndefined();
        expect(response.statusCode).toBe(304);
        expect(response.headers.get('etag')).toBe(ETAG);
        expect(response.headers.get('cache-control')).toBe(cacheControl);
      });
    }
  }
});

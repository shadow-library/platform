/**
 * The test IdP must be evaluated first: it stands up the mock issuer the push client's AuthClient mints
 * its `web-novel:publish` tokens against — same ordering requirement as publish-runner.spec.ts.
 */
import { APP_ID, CLIENT_SECRET, testIdP } from '@tests/test-idp';

import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AuthClient } from '@shadow-library/auth';

import { JobExecutor } from '@modules/jobs/job.executor';
import { type NovelBundle } from '@modules/novel-import/novel-import.dto';
import { PublicationAccessService } from '@modules/publishing/publication-access.service';
import { PublishRunner } from '@modules/publishing/publish-runner';
import { PublishingService } from '@modules/publishing/publishing.service';
import { ReaderPushClient } from '@modules/publishing/reader-push.client';
import { WikiPublishingService } from '@modules/publishing/wiki-publishing.service';
import { createTestDatabaseService } from '@tests/fixtures/database-service';
import { TestEnvironment } from '@tests/test-environment';

import { MockReaderService } from '../publishing/mock-reader';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('novel_import_publish');

function finalBundle(): NovelBundle {
  return {
    format: 'novel-import',
    schemaVersion: 1,
    mode: 'final',
    novel: { title: 'Imported and Publishable', synopsis: 'A finished novel, delivered whole.' },
    volumes: [
      {
        ordinal: 1,
        chapters: [
          { title: 'Opening', content: 'The story begins here, in full.' },
          { title: 'Closing', content: 'And it ends here, resolved.' },
        ],
      },
    ],
  };
}

describe.if(pgAvailable)('Novel import (final mode) → publish (mocked reader)', () => {
  testEnv.init();
  const reader = new MockReaderService();

  beforeAll(() => {
    process.env['SERVICE_URL_WEB_NOVEL_SERVER'] = reader.start();
  });

  // The reader URL env is process-global; leaving it set would point a dead reader at every later spec file.
  afterAll(() => {
    reader.stop();
    delete process.env['SERVICE_URL_WEB_NOVEL_SERVER'];
  });

  it('should carry an imported chapter through the real publishing gate and a real reader push', async () => {
    const executor = testEnv.getService(JobExecutor);
    const realDispatch = executor.dispatch.bind(executor);
    (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = async () => undefined;

    const imported = await testEnv.getRouter().mockRequest().post('/api/v1/import').body({ bundle: finalBundle() });
    expect(imported.statusCode).toBe(202);
    const { projectId, jobId } = imported.json() as { projectId: string; jobId: string };
    await realDispatch(jobId);
    (executor as unknown as { dispatch: typeof executor.dispatch }).dispatch = realDispatch;

    const job = await testEnv.getRouter().mockRequest().get(`/api/v1/jobs/${jobId}`);
    expect(job.json()).toMatchObject({ status: 'done' });

    // The publishing gate: PUB_002 (locked + non-empty) and PUB_003 (contiguous from 1) both pass on
    // the import's own writes, with no further editing.
    const published = await testEnv
      .getRouter()
      .mockRequest()
      .post(`/api/v1/projects/${projectId}/publish`)
      .body({ novelSlug: 'imported-and-publishable', title: 'Imported and Publishable' });
    expect(published.statusCode).toBe(200);
    for (const n of [1, 2]) {
      const scheduled = await testEnv.getRouter().mockRequest().post(`/api/v1/projects/${projectId}/chapters/${n}/publish`).body({});
      expect(scheduled.statusCode).toBe(202);
    }

    // Same mocked-reader harness as tests/publishing/publish-runner.spec.ts: a real PublishRunner,
    // pointed at the real DB the app just wrote through, converges the ledger against an in-process
    // reader — proving the imported chapters push through the exact publishing path production uses.
    const databaseService = createTestDatabaseService(testEnv.getPostgresClient()) as never;
    const authClient = new AuthClient({ issuer: testIdP.issuer, appId: APP_ID, client: { id: APP_ID, secret: CLIENT_SECRET } });
    const publishingService = new PublishingService(databaseService);
    const accessService = new PublicationAccessService(databaseService, publishingService, authClient);
    const runner = new PublishRunner(databaseService, publishingService, new ReaderPushClient(authClient), accessService, new WikiPublishingService(databaseService));

    const result = await runner.converge(BigInt(projectId));
    expect(result).toMatchObject({ novel: 'applied', pushed: [1, 2], failed: [] });

    const novel = reader.novels.get('imported-and-publishable');
    expect([...(novel?.chapters.keys() ?? [])]).toEqual([1, 2]);
    expect(novel?.chapters.get(1)).toMatchObject({ title: 'Opening', content: 'The story begins here, in full.' });

    const tokenRequest = testIdP.getLastTokenRequest();
    expect(tokenRequest?.body).toMatchObject({ grant_type: 'client_credentials', scope: 'web-novel:publish', resource: 'api://web-novel' });
  });
});

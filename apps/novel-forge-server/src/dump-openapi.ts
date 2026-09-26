import 'reflect-metadata';

import { createOfflineAuth } from '@shadow-library/auth/testing';
import { setConfig, silenceLogger } from '@shadow-library/common/testing';
import { dumpOpenApiDocument, fakeDatabaseProvider, fakeStorageProvider, OPENAPI_DUMP_CONFIG, withoutStartupHooks } from '@shadow-library/modules/testing';

const APP_ID = 'novel-forge';

silenceLogger();
const auth = await createOfflineAuth({ clientId: APP_ID, routes: { basePath: '/api/auth' }, app: { redirectUris: ['http://localhost:8080/api/auth/callback'] } });
setConfig({ ...OPENAPI_DUMP_CONFIG, 'auth.issuer': auth.idp.issuer, 'auth.app-id': APP_ID, 'auth.client.secret': 'openapi-dump', 'plugins.dir': '' });

const { AppModule } = await import('./app.module');
const { WorkflowRunService } = await import('@modules/ai/graphs/workflow-run.service');
const { AuthoringJobJanitor, CheckpointJanitor, JobExecutor, JobService, PublicationJanitor } = await import('@modules/jobs');
const { ChapterReviewService } = await import('@modules/review');
const { BibleAuditService } = await import('@modules/audit');

/** Each of these recovers, dispatches, sweeps or registers jobs at boot; the workflow runner opens its own LangGraph checkpoint connection */
const overrides = [
  fakeDatabaseProvider(),
  fakeStorageProvider(),
  ...auth.providers,
  withoutStartupHooks(WorkflowRunService),
  withoutStartupHooks(JobService),
  withoutStartupHooks(JobExecutor),
  withoutStartupHooks(AuthoringJobJanitor),
  withoutStartupHooks(CheckpointJanitor),
  withoutStartupHooks(PublicationJanitor),
  withoutStartupHooks(ChapterReviewService),
  withoutStartupHooks(BibleAuditService),
];
await dumpOpenApiDocument(AppModule, { outputPath: process.argv[2], overrides });
process.exit(0);

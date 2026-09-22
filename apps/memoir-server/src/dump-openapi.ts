import 'reflect-metadata';

import { createOfflineAuth } from '@shadow-library/auth/testing';
import { setConfig, silenceLogger } from '@shadow-library/common/testing';
import { dumpOpenApiDocument, fakeDatabaseProvider, fakeStorageProvider, OPENAPI_DUMP_CONFIG } from '@shadow-library/modules/testing';

const APP_ID = 'memoir';

silenceLogger();
const auth = await createOfflineAuth({ clientId: APP_ID, routes: { basePath: '/api/auth' }, app: { redirectUris: ['http://localhost:8080/api/auth/callback'] } });
setConfig({
  ...OPENAPI_DUMP_CONFIG,
  'auth.issuer': auth.idp.issuer,
  'auth.app-id': APP_ID,
  'auth.client.secret': 'openapi-dump',
  'scheduler.enabled': false,
  'telemetry.pseudo-id-secret': 'openapi-dump',
  'ai.inference-url': '',
});

const { AppModule } = await import('./app.module');
await dumpOpenApiDocument(AppModule, { outputPath: process.argv[2], overrides: [fakeDatabaseProvider(), fakeStorageProvider(), ...auth.providers] });
process.exit(0);

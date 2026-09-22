import 'reflect-metadata';

import { setConfig, silenceLogger } from '@shadow-library/common/testing';
import { dumpOpenApiDocument, fakeDatabaseProvider, OPENAPI_DUMP_CONFIG, withoutStartupHooks } from '@shadow-library/modules/testing';

silenceLogger();
setConfig(OPENAPI_DUMP_CONFIG);

const { AppModule } = await import('./app.module');
const { KeyService } = await import('@modules/auth/keys');
const { SamlKeyService } = await import('@modules/auth/saml');
const { BootstrapService } = await import('@modules/bootstrap');
const { ApplicationService } = await import('@modules/system/application');

/** Each of these loads or seeds signing keys, applications and the platform organisation from Postgres at boot */
const overrides = [
  fakeDatabaseProvider(),
  withoutStartupHooks(KeyService),
  withoutStartupHooks(SamlKeyService),
  withoutStartupHooks(BootstrapService),
  withoutStartupHooks(ApplicationService),
];
await dumpOpenApiDocument(AppModule, { outputPath: process.argv[2], overrides });
process.exit(0);

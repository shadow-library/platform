import { Config } from '@shadow-library/common';
import { type FastifyConfig } from '@shadow-library/fastify';

import { SynapseErrorHandler } from '@modules/inference';

/** Room for a long conversation with images inlined as data URLs, matching the host gateway's own request cap */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export function httpServerConfig(): Partial<FastifyConfig> {
  return {
    host: Config.get('server.host'),
    port: Config.get('server.port'),
    bodyLimit: MAX_BODY_BYTES,
    keepAliveTimeout: Config.get('synapse.server.keep-alive-timeout-ms'),
    maxRequestsPerSocket: Config.get('synapse.server.max-requests-per-socket'),
    errorHandler: new SynapseErrorHandler(),
    /** The prompt members are `@Sensitive`, and dev and test log request bodies at debug, so masking cannot be left to production */
    maskSensitiveData: true,
  };
}

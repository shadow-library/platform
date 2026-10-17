export const NAMESPACE = '@shadow-library/synapse';

/** Namespace-qualified so a caller in any namespace reaches it with no `SERVICE_URL_*` override */
export const DEFAULT_SERVICE_NAME = 'synapse-server.synapse';
export const API_PATH = '/api/v1';

export const SYNAPSE_RESOURCE = 'api://synapse';
export const SYNAPSE_SCOPES: readonly string[] = Object.freeze(['synapse:infer', 'synapse:catalog:read']);

/** An error frame arrives on a stream that already answered 200, so it carries no status of its own */
export const STREAM_ERROR_STATUS = 502;

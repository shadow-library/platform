/**
 * Importing side-effect packages
 */
import 'reflect-metadata';
import './config';

/**
 * exporting modules
 */
export * from './classes';
export * from './decorators';
export * from './interfaces';
export * from './module';
export * from './services';
export * from './server.error';

export { FASTIFY_INSTANCE } from './constants';

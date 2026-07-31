/**
 * The public API of the access module: the `@Auth` decorator, the resolved-context types, and the
 * accessors handlers use to read them. The guard and module are intentionally not re-exported here —
 * they pull in the Session/Admin/Organisation/Key services, and re-exporting them would drag those
 * into every controller that only needs the decorator, so they are imported by path where required.
 */
export * from './access.decorator';
export * from './access.types';
export * from './auth-context.accessor';
export * from './context';

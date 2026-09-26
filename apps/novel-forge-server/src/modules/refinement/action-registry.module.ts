import { Module } from '@shadow-library/app';

import { ActionExecutorRegistry } from './action-registry';

/** Imports nothing, so the registry exists before any module registers into it (see `JobHandlerRegistry`). */
@Module({
  providers: [ActionExecutorRegistry],
  exports: [ActionExecutorRegistry],
})
export class ActionRegistryModule {}

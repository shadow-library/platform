import { Module } from '@shadow-library/app';

import { JobHandlerRegistry } from './job-handler.registry';

@Module({
  providers: [JobHandlerRegistry],
  exports: [JobHandlerRegistry],
})
export class JobHandlerRegistryModule {}

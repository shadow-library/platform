import { Module } from '@shadow-library/app';

import { ProjectEventService } from './project-event.service';
import { ProjectEventsController } from './project-events.controller';

@Module({
  controllers: [ProjectEventsController],
  providers: [ProjectEventService],
  exports: [ProjectEventService],
})
export class EventsModule {}

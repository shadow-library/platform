import { Authenticated } from '@shadow-library/auth/module';
import { EventStream, Get, HttpController, type HttpResponse, Params, Res } from '@shadow-library/fastify';

import { ProjectEventService } from './project-event.service';
import { ProjectEventsParams } from './project-events.dto';

@Authenticated()
@HttpController('/api/v1/projects/:projectId')
export class ProjectEventsController {
  constructor(private readonly events: ProjectEventService) {}

  /**
   * Server-sent events for one project. The subscription is taken before `ready` is sent, so a client that refetches
   * on `ready` to cover whatever it missed while disconnected cannot miss a change made in between.
   */
  @Get('/events')
  streamEvents(@Params() params: ProjectEventsParams, @Res() response: HttpResponse): void {
    const stream = EventStream.open(response);
    stream.onClose(this.events.subscribe(params.projectId, event => stream.send({ event: event.type, data: event })));
    stream.send({ event: 'ready', data: {} });
  }
}

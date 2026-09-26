import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { EventStream, Get, Headers, HttpController, type HttpResponse, Params, Post, Query, Res, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';
import { type Job } from '@server/database';

import { CancelJobResponse } from '../generation/generation.dto';
import { payloadOrigin } from '../jobs/job.service';
import { type ChatJobEvent, ChatJobReader } from './chat-job.reader';
import { ChatJobService } from './chat-job.service';
import { ChatJobEventResponse, ChatJobEventsQuery, ChatJobParams, ChatJobResponse, ChatJobsParams, ListChatJobEventsResponse, ListChatJobsResponse } from './chat-jobs.dto';

const CURSOR = /^[0-9]{1,9}$/;

function cursorOf(query: string | undefined, lastEventId: unknown): number | null {
  const value = lastEventId ?? query;
  if (value === undefined) return null;
  if (typeof value !== 'string' || !CURSOR.test(value)) throw AppErrorCode.CHT_008.create();
  return Number(value);
}

function serialiseJob(job: Job.Row): ChatJobResponse {
  const origin = payloadOrigin(job.payload);
  return {
    id: job.id,
    kind: job.kind,
    target: job.target,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    progress: job.progress,
    nextAttemptAt: job.nextAttemptAt,
    origin: { proposalId: origin?.proposalId ?? '', opIndex: origin?.opIndex ?? 0, messageId: origin?.messageId ?? null },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function serialiseEvent(event: ChatJobEvent): ChatJobEventResponse {
  return { seq: event.seq, jobId: event.jobId, kind: event.kind, type: event.type, data: event.data, createdAt: event.createdAt };
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chat/sessions/:sessionId/jobs')
export class ChatJobsController {
  constructor(
    private readonly chatJobs: ChatJobService,
    private readonly reader: ChatJobReader,
  ) {}

  /** What a reopened chat shows: jobs still running plus those that settled in the last hour, and the cursor to follow it from. */
  @Get()
  @RespondFor(200, ListChatJobsResponse)
  async listJobs(@Params() params: ChatJobsParams): Promise<ListChatJobsResponse> {
    const { items, cursor } = await this.reader.listRecent(params.projectId, params.sessionId);
    return { items: items.map(serialiseJob), cursor };
  }

  @Get('/events')
  @RespondFor(200, ListChatJobEventsResponse)
  async listEvents(@Params() params: ChatJobsParams, @Query() query: ChatJobEventsQuery): Promise<ListChatJobEventsResponse> {
    const after = cursorOf(query.after, undefined);
    await this.reader.sessionCursor(params.projectId, params.sessionId);
    const events =
      after === null ? (await this.reader.replay(params.projectId, params.sessionId)).events : await this.reader.eventsAfter(params.projectId, params.sessionId, after);
    return { items: events.map(serialiseEvent) };
  }

  /**
   * Server-sent `job` events for every job this chat started, each with its cursor as the SSE id: a reconnect resumes after `Last-Event-ID`
   * (or `after`); with neither, the running jobs' events and how each job settled in the last hour ended replay. The session is checked before the response is hijacked, so an unknown one answers 404.
   */
  @Get('/stream')
  async streamEvents(
    @Params() params: ChatJobsParams,
    @Query() query: ChatJobEventsQuery,
    @Headers() headers: Record<string, unknown>,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const after = cursorOf(query.after, headers['last-event-id']);
    await this.reader.sessionCursor(params.projectId, params.sessionId);
    const stream = EventStream.open(response);
    stream.send({ event: 'ready', data: {} });
    const stop = this.chatJobs.follow(params.projectId, params.sessionId, after, event => stream.send({ id: String(event.seq), event: 'job', data: serialiseEvent(event) }));
    stream.onClose(stop);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:jobId/cancel')
  @RespondFor(200, CancelJobResponse)
  async cancelJob(@Params() params: ChatJobParams): Promise<CancelJobResponse> {
    const result = await this.chatJobs.cancel(params.projectId, params.sessionId, params.jobId);
    return { jobId: params.jobId, status: result.status, outcome: result.outcome };
  }
}

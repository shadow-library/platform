import { Injectable } from '@shadow-library/app';
import { AppError, ErrorCode, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { ChatService, type ChatTurnOptions } from './chat.service';
import { type ChatTurnEmitter } from './chat-turn-emitter';
import { serialiseMessage, serialiseTurn, withTurnCost } from './serialise';
import { TurnCostService } from './turn-cost.service';
import { TurnEventFollower } from './turn-event-follower';
import { TurnEventLog } from './turn-event-log';
import { TurnEventRepository } from './turn-event.repository';
import { type TurnStreamListener } from './turn-stream.types';

const CURSOR = /^[0-9]{1,9}$/;

/** A `Last-Event-ID` this stream did not send is read as none: replaying from the start behind a `reset` is always safe for the client. */
export function resumeCursorOf(lastEventId: unknown): number | null {
  return typeof lastEventId === 'string' && CURSOR.test(lastEventId) ? Number(lastEventId) : null;
}

/**
 * The turn stream's server half: the POST starts a turn and answers with its run id, the GET follows that run. The two are separate
 * requests that may reach different replicas, so every frame a turn emits is stored under its run and read back from there. The turn
 * itself is owned by the replica that took the POST, not by either request, so neither a client that never connects nor one that closes
 * its tab mid-reply can abort it.
 */
@Injectable()
export class TurnStreamService {
  private readonly logger = Logger.getLogger(APP_NAME, TurnStreamService.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly turnCost: TurnCostService,
    private readonly turnEvents: TurnEventRepository,
  ) {}

  /** Starts a turn and resolves with its run id as soon as the run exists — the turn goes on running behind the answer. */
  async start(projectId: bigint, sessionId: string, content: string, options: ChatTurnOptions = {}): Promise<string> {
    const sink: { log: TurnEventLog | null } = { log: null };
    let settle: (runId: string) => void = () => undefined;
    let fail: (err: unknown) => void = () => undefined;
    const started = new Promise<string>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });

    const emitter: ChatTurnEmitter = {
      onRunId: runId => {
        sink.log = new TurnEventLog(this.turnEvents, projectId, runId);
        settle(runId);
      },
      onUserMessage: message => sink.log?.append('user', serialiseMessage(message)),
      onLookup: event => sink.log?.append('lookup', event),
      onDelta: text => sink.log?.delta(text),
      onChange: event => sink.log?.append('change', event),
      onReset: () => sink.log?.append('reset', {}),
    };

    this.chatService.turn(projectId, sessionId, content, emitter, options).then(
      async result => {
        // `onRunId` is the only thing that answers the POST, and `EmitterRelay` swallows a throw from it —
        // without this a turn that succeeded anyway would leave the request hanging forever.
        settle(result.runId);
        const log = (sink.log ??= new TurnEventLog(this.turnEvents, projectId, result.runId));
        const turn = serialiseTurn(result);
        const cost = await this.turnCost.forMessages(projectId, [result.assistantMessage]).catch((err: unknown) => {
          this.logger.warn('chat turn cost lookup failed — the done frame goes without it', { projectId, runId: result.runId, err });
          return undefined;
        });
        await log.finish('done', { ...turn, assistantMessage: withTurnCost(turn.assistantMessage, cost?.get(result.assistantMessage.id)) });
      },
      async (err: unknown) => {
        this.logger.warn('chat turn stream failed', { projectId, sessionId, runId: sink.log?.runId, err });
        // A turn that dies before its run exists never answered the POST; once it exists the caller is
        // long gone and the failure rides the stream instead.
        fail(err);
        await sink.log?.finish('error', AppError.is(err) ? err.toResponse() : { code: ErrorCode.UNKNOWN.code, message: ErrorCode.UNKNOWN.message });
      },
    );

    return started;
  }

  /** Throws before the route hijacks its response, so an unknown, foreign or expired run answers 404 rather than an empty stream. */
  async assertRun(projectId: bigint, runId: string): Promise<void> {
    const run = await this.turnEvents.findRun(projectId, runId);
    // Another project's run answers as missing: that an author elsewhere is mid-turn is not ours to confirm.
    if (!run || !(run.running || run.hasEvents || run.recentlyEnded)) throw AppErrorCode.CHT_007.create();
  }

  /** Feeds `listener` the run's frames after `after` (from the start when null) until the returned stop runs or the run ends. */
  follow(projectId: bigint, runId: string, after: number | null, listener: TurnStreamListener): () => void {
    const follower = new TurnEventFollower(this.turnEvents, projectId, runId, after, listener);
    follower.start();
    return () => follower.stop();
  }
}

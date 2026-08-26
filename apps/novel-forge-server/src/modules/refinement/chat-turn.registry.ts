import { Injectable } from '@shadow-library/app';

import { type Refinement } from '@server/database';

import { type SeedResponse } from '../ideation/ideation.dto';
import { type ChatTurnResult } from './chat.service';

export interface ScopedTurnResult extends ChatTurnResult {
  /** The scope's own artifact as the turn left it — the studio's sheet, so a turn needs no follow-up read. */
  seed?: SeedResponse;
}

export type ChatTurnHandler = (projectId: bigint, sessionId: string, content: string) => Promise<ScopedTurnResult>;

/**
 * Chat scopes whose turn pipeline lives outside this module. The Ideation Studio runs the router, the
 * seed sheet, and the concept and stress rounds — none of which belong in `ChatService.turn`, which
 * still rejects the scope defensively — but its conversation rides the ordinary chat endpoints. The
 * registry lives here (dependency-free) because the ideation module imports this one, so the handler
 * is pushed down at bootstrap exactly as the hub's action executors are.
 */
@Injectable()
export class ChatTurnRegistry {
  private readonly handlers = new Map<Refinement.ChatScope, ChatTurnHandler>();

  register(scope: Refinement.ChatScope, handler: ChatTurnHandler): void {
    this.handlers.set(scope, handler);
  }

  get(scope: Refinement.ChatScope): ChatTurnHandler | undefined {
    return this.handlers.get(scope);
  }
}

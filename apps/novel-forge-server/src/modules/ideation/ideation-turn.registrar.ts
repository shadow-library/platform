import { Injectable } from '@shadow-library/app';

import { ChatTurnRegistry } from '../refinement/chat-turn.registry';
import { IdeationService } from './ideation.service';

/**
 * Hands the studio's turn pipeline to the chat endpoints. The conversation rides the ordinary chat
 * routes, but its turn is the studio's — router phase, seed sheet, concept and stress rounds — so the
 * handler is pushed down into the dependency-free registry at bootstrap, the same shape the hub's
 * action executors are registered in.
 */
@Injectable()
export class IdeationTurnRegistrar {
  constructor(
    private readonly registry: ChatTurnRegistry,
    private readonly ideationService: IdeationService,
  ) {}

  onModuleInit(): void {
    this.registry.register('ideation', (projectId, sessionId, content) => this.ideationService.turn(projectId, sessionId, content));
  }
}

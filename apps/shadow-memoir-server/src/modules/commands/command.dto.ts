import { Field, Schema } from '@shadow-library/class-schema';

import { type CommandEnvelope } from './command.types';

@Schema()
export class CommandEnvelopeDto implements CommandEnvelope {
  @Field({ format: 'uuid', description: 'Client-minted UUIDv7 for this action; resending it replays the recorded outcome instead of re-executing' })
  commandId: string;

  @Field({ maxLength: 64, description: 'Domain command name; must be one the server has a registered handler for' })
  type: string;

  @Field({ default: {}, description: 'Command-specific body, validated by the handler for this type' })
  payload: Record<string, unknown>;

  @Field({ optional: true, format: 'date-time', description: 'Claimed instant of the action for offline commands; clamped server-side and never trusted as authoritative' })
  performedAt?: string;

  @Field({ format: 'date', description: "The action's user-local calendar date in the account's timezone" })
  localDate: string;

  @Field({ optional: true, format: 'uuid', description: 'Registered device this command was minted on' })
  deviceId?: string;
}

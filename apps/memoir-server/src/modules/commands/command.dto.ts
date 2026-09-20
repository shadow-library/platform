import { Field, Schema } from '@shadow-library/class-schema';

import { type CommandEnvelope } from './command.types';

/** Patterns rather than `format:` — fastify's route schema compiler registers no formats and refuses to build a route carrying one. */
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const DATE_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$';

@Schema()
export class CommandEnvelopeDto implements CommandEnvelope {
  @Field({ pattern: UUID_PATTERN, description: 'Client-minted UUIDv7 for this action; resending it replays the recorded outcome instead of re-executing' })
  commandId: string;

  @Field({ maxLength: 64, description: 'Domain command name; must be one the server has a registered handler for' })
  type: string;

  @Field({ additionalProperties: true, default: {}, description: 'Command-specific body, validated by the handler for this type' })
  payload: Record<string, unknown>;

  @Field({ optional: true, pattern: DATE_TIME_PATTERN, description: 'Claimed instant of the action for offline commands; clamped server-side and never trusted as authoritative' })
  performedAt?: string;

  @Field({ pattern: DATE_PATTERN, description: "The action's user-local calendar date in the account's timezone" })
  localDate: string;

  @Field({ optional: true, pattern: UUID_PATTERN, description: 'Registered device this command was minted on' })
  deviceId?: string;
}

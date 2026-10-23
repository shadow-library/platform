import { Class } from 'type-fest';

export interface SchemaComposerMetadata {
  opName?: string;
  op: 'anyOf' | 'oneOf';
  classes: Class<unknown>[];
  discriminatorKey?: string;
}

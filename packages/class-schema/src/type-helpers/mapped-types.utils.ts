/**
 * Importing npm packages
 */
import { Reflector } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS } from '@lib/constants';
import { FieldSchema } from '@lib/interfaces';

/**
 * Defining types
 */

type IsPropertyInherited = (key: string) => boolean;

/**
 * Declaring the constants
 */

export function cloneClassSchema(sourceClass: Class<unknown>, fieldSchema: FieldSchema, isPropertyInherited: IsPropertyInherited = () => true): Class<unknown> {
  /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
  const TargetClass = class {};

  /** Copying the schema related metadata */
  Reflector.cloneMetadata(TargetClass, sourceClass);
  Reflector.cloneMetadata(TargetClass.prototype, sourceClass.prototype);

  const sourceFields: string[] = Reflector.getMetadata(METADATA_KEYS.SCHEMA_FIELDS, sourceClass.prototype) ?? [];
  const fields = sourceFields.filter(field => isPropertyInherited(field));
  Reflector.defineMetadata(METADATA_KEYS.SCHEMA_FIELDS, fields, TargetClass.prototype);
  for (const field of fields) {
    Reflector.cloneMetadata(TargetClass.prototype, sourceClass.prototype, field);
    Reflector.updateMetadata(METADATA_KEYS.FIELD_OPTIONS, fieldSchema, TargetClass.prototype, field);
  }
  return TargetClass;
}

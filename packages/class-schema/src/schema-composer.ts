/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { METADATA_KEYS, getCounterId } from './constants';
import { Schema } from './decorators';
import { EnumType } from './enum-type';
import { SchemaComposerMetadata } from './internal.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class SchemaComposer {
  private static createClass(metadata: SchemaComposerMetadata): Class<unknown> {
    assert(metadata.classes.length > 1, `${metadata.opName ?? metadata.op} requires at least 2 classes`);

    const query = new URLSearchParams();
    const classNames = metadata.classes.map(cls => cls.name).sort();
    query.set('Classes', classNames.join(','));
    if (metadata.discriminatorKey) query.set('discriminatorKey', metadata.discriminatorKey);

    /* eslint-disable-next-line @typescript-eslint/no-extraneous-class */
    class ComposedClass {}
    Schema({ $id: `class-schema:${metadata.op}?${query}` })(ComposedClass);
    Reflect.defineMetadata(METADATA_KEYS.COMPOSED_CLASS, metadata, ComposedClass);
    return ComposedClass;
  }

  static anyOf<T extends Class<unknown>[]>(...Classes: T): T[number] {
    return this.createClass({ op: 'anyOf', classes: Classes }) as T[number];
  }

  static oneOf<T extends Class<unknown>[]>(...Classes: T): T[number] {
    return this.createClass({ op: 'oneOf', classes: Classes }) as T[number];
  }

  static discriminator<T extends Class<unknown>[]>(key: string, ...Classes: T): T[number] {
    return this.createClass({ opName: 'discriminator', op: 'oneOf', classes: Classes, discriminatorKey: key }) as T[number];
  }

  static enum(name: string, values: string[] | number[]): Class<unknown> {
    class EnumClass extends EnumType {
      static override readonly id = `class-schema:${name}-enum-${getCounterId()}`;
      static override readonly values = values;
      static override readonly type = typeof values[0] === 'number' ? 'number' : 'string';
    }

    return EnumClass;
  }
}

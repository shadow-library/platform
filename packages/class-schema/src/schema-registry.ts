/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ClassSchema } from './class-schema';
import { METADATA_KEYS } from './constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class SchemaRegistry {
  private readonly schemas: Map<string, ClassSchema>;

  constructor() {
    this.schemas = new Map();
  }

  private getSchemaId(Class: Class<unknown>): string {
    const options = Reflect.getMetadata(METADATA_KEYS.SCHEMA_OPTIONS, Class) ?? {};
    return options.$id ?? Class.name;
  }

  addSchema(Class: Class<unknown>): this {
    const id = this.getSchemaId(Class);
    if (!this.schemas.has(id)) {
      const dependencies = new Set<Class<unknown>>();
      this.schemas.set(id, new ClassSchema(Class, { shallow: true, dependencies }));
      dependencies.forEach(dep => this.addSchema(dep));
    }
    return this;
  }

  getSchema(Class: Class<unknown>): ClassSchema {
    const id = this.getSchemaId(Class);
    if (!this.schemas.has(id)) this.addSchema(Class);
    return this.schemas.get(id) as ClassSchema;
  }
}

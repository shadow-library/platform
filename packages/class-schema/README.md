# @shadow-library/class-schema

[![npm version](https://badge.fury.io/js/@shadow-library%2Fclass-schema.svg)](https://badge.fury.io/js/@shadow-library%2Fclass-schema)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful TypeScript decorator-based JSON schema generator that creates JSON schemas at runtime from class definitions. Perfect for API validation, documentation generation, and data transformation.

## Features

- 🎯 **Decorator-based**: Define schemas using simple decorators
- 🚀 **Runtime Generation**: Generate JSON schemas at runtime
- 🔧 **TypeScript Support**: Full TypeScript integration with type safety
- 📦 **Lightweight**: Minimal dependencies (only `deepmerge`)
- 🔄 **Type Transformations**: Built-in utility types (`PartialType`, `PickType`, `OmitType`)
- 🏗️ **Schema Composition**: Support for inheritance and schema composition
- 📋 **Comprehensive Validation**: Support for all JSON Schema validation keywords
- 🎛️ **Flexible Configuration**: Customizable schema options and transformations
- 🔗 **Schema Registry**: Manage and reuse schemas efficiently
- ⚡ **Transform Factory**: Built-in data transformation capabilities

## Installation

```bash
# Using npm
npm install @shadow-library/class-schema

# Using yarn
yarn add @shadow-library/class-schema

# Using bun
bun add @shadow-library/class-schema
```

### Peer Dependencies

```bash
# Using npm
npm install @shadow-library/common reflect-metadata

# Using yarn
yarn add @shadow-library/common reflect-metadata

# Using bun
bun add @shadow-library/common reflect-metadata
```

## Quick Start

```typescript
import { Schema, Field, ClassSchema, Integer } from '@shadow-library/class-schema';

@Schema()
class User {
  @Field({ format: 'email' })
  email: string;

  @Field(() => String, { minLength: 2, maxLength: 50 })
  name: string;

  @Field(() => Integer, { minimum: 0, maximum: 150 })
  age: number;

  @Field({ optional: true })
  bio?: string;
}

// Generate JSON Schema
const schema = ClassSchema.generate(User);
console.log(schema);
```

Output:

```json
{
  "$id": "class-schema:User-1",
  "type": "object",
  "required": ["email", "name", "age"],
  "additionalProperties": false,
  "properties": {
    "email": { "type": "string", "format": "email" },
    "name": { "type": "string", "minLength": 2, "maxLength": 50 },
    "age": { "type": "integer", "minimum": 0, "maximum": 150 },
    "bio": { "type": "string" }
  }
}
```

## Core Concepts

### Schema Decorator

The `@Schema()` decorator marks a class as a schema definition:

```typescript
@Schema({
  $id: 'MySchema', // Unique identifier
  title: 'My Schema', // Human-readable title
  description: 'A sample schema',
  minProperties: 1, // Minimum number of properties
  maxProperties: 10, // Maximum number of properties
  additionalProperties: false, // Disallow additional properties (default)
})
class MySchema {
  // ... fields
}
```

> Note: By default, all generated object schemas set `additionalProperties` to `false`. Explicitly set `additionalProperties: true` or provide a class (e.g., `String`) to allow or type additional properties.

### Field Decorator

The `@Field()` decorator defines schema properties with validation rules:

```typescript
class Example {
  // Basic field
  @Field()
  name: string;

  // Field with validation
  @Field({ minLength: 3, maxLength: 50, pattern: '^[a-zA-Z]+$' })
  username: string;

  // Optional field
  @Field({ optional: true })
  description?: string;

  // Field with default value
  @Field({ format: 'date-time' })
  createdAt: string = new Date().toISOString();

  // Nullable field
  @Field({ nullable: true })
  lastLogin: string | null;

  // Conditional requirement
  @Field({ requiredIf: 'hasAddress' })
  streetAddress: string;

  @Field()
  hasAddress: boolean;
}
```

## Field Types and Validation

### String Fields

```typescript
class StringExample {
  @Field({
    minLength: 5,
    maxLength: 100,
    pattern: '^[a-zA-Z0-9]+$',
    format: 'email', // email, date, date-time, uri, uuid, etc.
  })
  email: string;

  @Field({ enum: ['active', 'inactive', 'pending'] })
  status: string;
}
```

### Number Fields

```typescript
import { Integer } from '@shadow-library/class-schema';

class NumberExample {
  @Field(() => Number, {
    minimum: 0,
    maximum: 100,
    multipleOf: 0.5,
  })
  score: number;

  @Field(() => Integer, {
    minimum: 18,
    maximum: 120,
    exclusiveMinimum: 17,
  })
  age: number;
}
```

### Boolean Fields

```typescript
class BooleanExample {
  @Field()
  isActive: boolean;

  @Field({ const: true })
  termsAccepted: boolean;
}
```

### Array Fields

```typescript
@Schema()
class Tag {
  @Field()
  name: string;
}

class ArrayExample {
  @Field(() => [String], {
    minItems: 1,
    maxItems: 10,
    uniqueItems: true,
  })
  tags: string[];

  @Field(() => [Tag])
  categories: Tag[];

  @Field(() => [Number], {
    minItems: 3,
    maxItems: 3,
  })
  coordinates: number[]; // [x, y, z]
}
```

### Object References

```typescript
@Schema()
class Address {
  @Field()
  street: string;

  @Field()
  city: string;

  @Field({ pattern: '^[0-9]{5}$' })
  zipCode: string;
}

@Schema()
class User {
  @Field()
  name: string;

  @Field(() => Address)
  address: Address;

  @Field(() => [Address])
  previousAddresses: Address[];
}
```

## Advanced Features

### Schema Inheritance

```typescript
@Schema()
class BaseEntity {
  @Field(() => String, { format: 'uuid' })
  id: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: string;

  @Field(() => String, { format: 'date-time' })
  updatedAt: string;
}

@Schema({ title: 'User Schema' })
class User extends BaseEntity {
  @Field({ format: 'email' })
  email: string;

  @Field()
  name: string;
}
```

### Pattern Properties

```typescript
@Schema({
  patternProperties: {
    '^config_[a-zA-Z]+$': String,
  },
})
class DynamicConfig {
  @Field()
  version: string;

  // Allows properties like config_database, config_cache, etc.
  [key: string]: string;
}
```

### Additional Properties

```typescript
@Schema({ additionalProperties: String })
class FlexibleSchema {
  @Field()
  name: string;

  // Allows any additional string properties
  [key: string]: string;
}

// Or disable additional properties
@Schema({ additionalProperties: false })
class StrictSchema {
  @Field()
  name: string;
  // No additional properties allowed
}
```

> Default behavior: If `additionalProperties` is not specified, it defaults to `false` on all object schemas generated by this library.

### Type Helpers

Create derivative schemas using utility types:

```typescript
import { PartialType, PickType, OmitType } from '@shadow-library/class-schema';

@Schema()
class User {
  @Field()
  id: string;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  password: string;
}

// All fields optional
class UpdateUserDto extends PartialType(User) {}

// Pick specific fields
class PublicUser extends PickType(User, ['id', 'email', 'name'] as const) {}

// Omit sensitive fields
class CreateUserDto extends OmitType(User, ['id'] as const) {}
```

## Schema Composition

The `SchemaComposer` provides utilities for composing multiple schemas using JSON Schema's `anyOf`, `oneOf`, and discriminator patterns.

### Using `anyOf`

Use `anyOf` when the data can match any of the specified schemas:

```typescript
import { Schema, Field, SchemaComposer, ClassSchema } from '@shadow-library/class-schema';

@Schema({ $id: 'EmailContact' })
class EmailContact {
  @Field({ const: 'email' })
  type: 'email';

  @Field({ format: 'email' })
  address: string;
}

@Schema({ $id: 'PhoneContact' })
class PhoneContact {
  @Field({ const: 'phone' })
  type: 'phone';

  @Field()
  number: string;
}

// Create a union type using anyOf
const Contact = SchemaComposer.anyOf(EmailContact, PhoneContact);
const schema = ClassSchema.generate(Contact);
```

### Using `oneOf`

Use `oneOf` when the data must match exactly one of the specified schemas:

```typescript
const User = SchemaComposer.oneOf(NativeUser, OAuthUser);
const schema = ClassSchema.generate(User);
```

### Using Discriminators

Use `discriminator` for efficient variant detection based on a discriminator property. This generates a JSON Schema with a `discriminator` object containing `propertyName` and `mapping`:

```typescript
@Schema({ $id: 'NativeUser' })
class NativeUser {
  @Field({ const: 'native' })
  type: 'native';

  @Field()
  username: string;

  @Field()
  password: string;
}

@Schema({ $id: 'OAuthUser' })
class OAuthUser {
  @Field({ const: 'oauth' })
  type: 'oauth';

  @Field()
  username: string;

  @Field()
  provider: string;
}

// Create discriminated union with 'type' as the discriminator key
const User = SchemaComposer.discriminator('type', NativeUser, OAuthUser);
const schema = ClassSchema.generate(User);

console.log(schema);
// Output includes:
// {
//   "oneOf": [{ "$ref": "NativeUser" }, { "$ref": "OAuthUser" }],
//   "discriminator": {
//     "propertyName": "type",
//     "mapping": { "native": "NativeUser", "oauth": "OAuthUser" }
//   },
//   ...
// }
```

### Nested Schema Composition

Schema composition works seamlessly with nested fields:

```typescript
@Schema({ $id: 'Account' })
class Account {
  @Field()
  id: string;

  @Field(() => SchemaComposer.oneOf(NativeUser, OAuthUser))
  admin: NativeUser | OAuthUser;

  @Field(() => [SchemaComposer.discriminator('type', NativeUser, OAuthUser)])
  users: (NativeUser | OAuthUser)[];
}
```

### Enum Types

Create reusable enum schemas using `EnumType.create()` for string or number enumerations:

```typescript
import { Schema, Field, EnumType, ClassSchema } from '@shadow-library/class-schema';

// Create string enum
const Status = EnumType.create('Status', ['active', 'inactive', 'pending']);

// Create number enum (e.g., priority levels)
const Priority = EnumType.create('Priority', [1, 2, 3, 4, 5]);

// Create enum with additional options
const Role = EnumType.create('Role', ['admin', 'user', 'guest'], {
  description: 'User role in the system',
  nullable: true,
});

@Schema({ $id: 'Task' })
class Task {
  @Field()
  name: string;

  @Field(() => Status)
  status: string;

  @Field(() => Priority)
  priority: number;
}

const schema = ClassSchema.generate(Task);
console.log(schema);
// Output:
// {
//   "$id": "Task",
//   "type": "object",
//   "required": ["name", "status", "priority"],
//   "additionalProperties": false,
//   "properties": {
//     "name": { "type": "string" },
//     "status": { "$ref": "class-schema:Status-enum-0" },
//     "priority": { "$ref": "class-schema:Priority-enum-1" }
//   },
//   "definitions": {
//     "class-schema:Status-enum-0": {
//       "$id": "class-schema:Status-enum-0",
//       "type": "string",
//       "enum": ["active", "inactive", "pending"]
//     },
//     "class-schema:Priority-enum-1": {
//       "$id": "class-schema:Priority-enum-1",
//       "type": "number",
//       "enum": [1, 2, 3, 4, 5]
//     }
//   }
// }
```

## Schema Registry

Manage multiple schemas efficiently:

```typescript
import { SchemaRegistry } from '@shadow-library/class-schema';

const registry = new SchemaRegistry();

// Add schemas to registry
registry.addSchema(User);
registry.addSchema(Address);

// Get schema instance
const userSchema = registry.getSchema(User);
const jsonSchema = userSchema.getJSONSchema();
```

## Data Transformation

The `TransformerFactory` provides powerful data transformation capabilities with two main methods: `compile` and `maybeCompile`.

### Basic Transformation with `compile`

The `compile` method always returns a transformer function. If no fields match the filter, it returns a no-op function that passes data through unchanged:

```typescript
import { TransformerFactory } from '@shadow-library/class-schema';

@Schema()
class Product {
  @Field()
  name: string;

  @Field(() => Number, { minimum: 0 })
  price: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: string;
}

const schema = ClassSchema.generate(Product);

// Create transformer for date fields
const factory = new TransformerFactory(fieldSchema => fieldSchema.format === 'date-time');
const transformer = factory.compile(schema);
const data = {
  name: 'Laptop',
  price: 999.99,
  createdAt: '2023-01-01T12:00:00Z',
};

// Transform date strings to Date objects
const transformed = transformer(data, value => new Date(value));
console.log(transformed.createdAt instanceof Date); // true
```

> **Note on field handling**: The transformer uses `'field' in data` to check fields, so fields explicitly set to `undefined` or `null` **are transformed**, while missing keys are skipped. If the action returns `undefined`, the field is **removed** from the object. Array items that transform to `undefined` are filtered out.

```typescript
// Transform to undefined - field is removed
transformer({ name: 'test' }, () => undefined); // {}

// Field with null - transformed (key exists)
transformer({ name: null }, () => 'xxx'); // { name: 'xxx' }

// Missing key - not transformed (action not called)
transformer({}, () => 'xxx'); // {}
```

### Conditional Transformation with `maybeCompile`

The `maybeCompile` method returns `null` if no fields match the filter, allowing you to optimize performance by skipping transformation entirely:

```typescript
@Schema()
class User {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;
}

const schema = ClassSchema.generate(User);

// Try to create transformer for date fields (none exist in this schema)
const factory = new TransformerFactory(fieldSchema => fieldSchema.format === 'date-time');
const transformer = factory.maybeCompile(schema);

if (transformer) {
  // Only transform if there are matching fields
  const transformed = transformer(userData, value => new Date(value));
} else {
  // No transformation needed - use original data
  console.log('No date fields found, skipping transformation');
}
```

### Performance Optimization Example

Use `maybeCompile` to avoid unnecessary transformations:

```typescript
class DataProcessor {
  private dateTransformer: ((data: any, action: any) => any) | null;
  private sensitiveTransformer: ((data: any, action: any) => any) | null;

  constructor(schema: ParsedSchema) {
    // Only create transformers if needed
    const dateFactory = new TransformerFactory(field => field.format === 'date-time');
    this.dateTransformer = dateFactory.maybeCompile(schema);

    const sensitiveFactory = new TransformerFactory(field => (field as any).sensitive === true);
    this.sensitiveTransformer = sensitiveFactory.maybeCompile(schema);
  }

  processData(data: any) {
    let result = data;

    // Transform dates only if schema has date fields
    if (this.dateTransformer) {
      result = this.dateTransformer(result, value => new Date(value as string));
    }

    // Mask sensitive data only if schema has sensitive fields
    if (this.sensitiveTransformer) {
      result = this.sensitiveTransformer(result, () => '[REDACTED]');
    }

    return result;
  }
}

// Usage
const processor = new DataProcessor(userSchema);
const processedData = processor.processData(rawUserData);
```

### Method Comparison

| Method                           | Return Type           | Use Case                                                          |
| -------------------------------- | --------------------- | ----------------------------------------------------------------- |
| `compile(schema)`                | `Transformer`         | Always returns a function, use when you always want to transform  |
| `maybeCompile(schema)`           | `Transformer \| null` | Returns null if no fields match, use for performance optimization |
| `hasTransformableFields(schema)` | `boolean`             | Check if schema has any transformable fields without compiling    |

### Checking for Transformable Fields

Use `hasTransformableFields` to check if a schema contains any fields that match the filter criteria, without actually compiling a transformer:

```typescript
import { TransformerFactory, ClassSchema } from '@shadow-library/class-schema';

@Schema()
class User {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ format: 'date-time' })
  createdAt: string;
}

@Schema()
class Product {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => Number)
  price: number;
}

const userSchema = ClassSchema.generate(User);
const productSchema = ClassSchema.generate(Product);

const dateFactory = new TransformerFactory(field => field.format === 'date-time');

// Check without compiling
console.log(dateFactory.hasTransformableFields(userSchema)); // true - has date-time field
console.log(dateFactory.hasTransformableFields(productSchema)); // false - no date-time fields

// Useful for conditional logic before expensive operations
if (dateFactory.hasTransformableFields(userSchema)) {
  const transformer = dateFactory.compile(userSchema);
  // Use transformer...
}
```

This method is useful when you need to:

- Conditionally enable/disable features based on schema capabilities
- Validate schemas before processing
- Make routing decisions based on schema content
- Avoid unnecessary transformer compilation in hot paths

### Masking Sensitive Data for Logging

Use transformers to mask sensitive information when logging data:

```typescript
import { TransformerFactory, FieldMetadata } from '@shadow-library/class-schema';

@Schema()
class User {
  @Field()
  id: string;

  @Field({ format: 'email' })
  email: string;

  @Field()
  name: string;

  @Field()
  @FieldMetadata({ sensitive: true })
  password: string;
}

const schema = ClassSchema.generate(User);

// Create transformer that detects sensitive fields
const maskingFactory = new TransformerFactory(fieldSchema => fieldSchema.sensitive === true);
const maskingTransformer = maskingFactory.compile(schema);

const userData = {
  id: 'user123',
  email: 'john.doe@example.com',
  name: 'John Doe',
  password: 'secretPassword123',
};

// Mask sensitive data for logging
const maskedData = maskingTransformer(userData, () => 'xxxx');

console.log('Original data:', userData);
console.log('Masked for logging:', maskedData);

// Output:
// Original data: {
//   id: 'user123',
//   email: 'john.doe@example.com',
//   name: 'John Doe',
//   password: 'secretPassword123'
// }
//
// Masked for logging: {
//   id: 'user123',
//   email: 'john.doe@example.com',
//   name: 'John Doe',
//   password: 'xxxx'
// }
```

### Transforming Discriminated Unions

The `TransformerFactory` automatically detects and handles discriminated union schemas (`anyOf`/`oneOf`). It intelligently determines the correct variant based on the data and applies transformations only to matching fields.

#### Automatic Discriminator Detection

The factory automatically detects discriminators using three strategies (in order of priority):

1. **Const discriminator**: Uses `const` values to identify variants
2. **Type discriminator**: Uses JavaScript `typeof` to distinguish variants
3. **Enum discriminator**: Uses non-overlapping enum values to distinguish variants

> **Important**: Only **required fields** are considered when detecting discriminators. Optional fields are skipped because they may not be present in the data, making them unreliable for variant discrimination. Make sure your discriminator field is marked as required (not optional) in your schema.

```typescript
@Schema({ $id: 'Cat' })
class Cat {
  @Field({ const: 'cat' })
  type: 'cat';

  @Field()
  @FieldMetadata({ sensitive: true })
  meow: string;
}

@Schema({ $id: 'Dog' })
class Dog {
  @Field({ const: 'dog' })
  type: 'dog';

  @Field()
  @FieldMetadata({ sensitive: true })
  bark: string;
}

// Create discriminated union
const Animal = SchemaComposer.oneOf(Cat, Dog);
const schema = ClassSchema.generate(Animal);

// Transformer automatically uses 'type' field as const discriminator
const factory = new TransformerFactory(field => field.sensitive === true);
const transformer = factory.compile(schema);

const catData = { type: 'cat', meow: 'meow meow' };
const dogData = { type: 'dog', bark: 'woof woof' };

console.log(transformer(catData, () => 'xxx')); // { type: 'cat', meow: 'xxx' }
console.log(transformer(dogData, () => 'xxx')); // { type: 'dog', bark: 'xxx' }
```

#### Type-Based Discriminator

When variants have fields with different JavaScript types:

```typescript
@Schema({ $id: 'StringVariant' })
class StringVariant {
  @Field()
  value: string;

  @Field()
  @FieldMetadata({ tagged: true })
  strField: string;
}

@Schema({ $id: 'NumberVariant' })
class NumberVariant {
  @Field(() => Number)
  value: number;

  @Field(() => Number)
  @FieldMetadata({ tagged: true })
  numField: number;
}

const Mixed = SchemaComposer.oneOf(StringVariant, NumberVariant);
const schema = ClassSchema.generate(Mixed);

// Factory detects 'value' field has different types and uses typeof for discrimination
const factory = new TransformerFactory(field => field.tagged === true);
const transformer = factory.compile(schema);

transformer({ value: 'hello', strField: 'world' }, () => 'xxx'); // { value: 'hello', strField: 'xxx' }
transformer({ value: 42, numField: 100 }, () => 999); // { value: 42, numField: 999 }
```

#### Enum-Based Discriminator

When variants have non-overlapping enum values:

```typescript
@Schema({ $id: 'SmallSize' })
class SmallSize {
  @Field({ enum: ['xs', 'sm'] })
  size: 'xs' | 'sm';

  @Field()
  @FieldMetadata({ tagged: true })
  smallField: string;
}

@Schema({ $id: 'LargeSize' })
class LargeSize {
  @Field({ enum: ['lg', 'xl'] })
  size: 'lg' | 'xl';

  @Field()
  @FieldMetadata({ tagged: true })
  largeField: string;
}

const Size = SchemaComposer.oneOf(SmallSize, LargeSize);
const schema = ClassSchema.generate(Size);

const factory = new TransformerFactory(field => field.tagged === true);
const transformer = factory.compile(schema);

transformer({ size: 'xs', smallField: 'tiny' }, () => 'xxx'); // { size: 'xs', smallField: 'xxx' }
transformer({ size: 'xl', largeField: 'huge' }, () => 'xxx'); // { size: 'xl', largeField: 'xxx' }
```

#### Fallback Behaviour

When no valid discriminator can be determined (e.g., overlapping enums or no distinguishing fields), the transformer applies all variant transformers to the data:

```typescript
@Schema({ $id: 'VariantA' })
class VariantA {
  @Field()
  @FieldMetadata({ tagged: true })
  fieldA: string;
}

@Schema({ $id: 'VariantB' })
class VariantB {
  @Field()
  @FieldMetadata({ tagged: true })
  fieldB: string;
}

const Union = SchemaComposer.oneOf(VariantA, VariantB);
const schema = ClassSchema.generate(Union);

const factory = new TransformerFactory(field => field.tagged === true);
const transformer = factory.compile(schema);

// Both transformers are applied since no discriminator exists
transformer({ fieldA: 'a', fieldB: 'b' }, () => 'xxx'); // { fieldA: 'xxx', fieldB: 'xxx' }
```

> **Best Practice**: Always ensure nested `$ref` objects are valid objects before transformation, or handle potential errors when the nested object might be `null` or `undefined`.

## Array Schemas

Generate schemas for arrays:

```typescript
@Schema()
class Item {
  @Field()
  name: string;

  @Field()
  value: number;
}

// Create array schema
const arraySchema = ClassSchema.generate([Item]);

console.log(arraySchema);
// Output:
// {
//   "$id": "Item?type=Array",
//   "type": "array",
//   "items": { "$ref": "Item" },
//   "definitions": {
//     "Item": { ... }
//   }
// }
```

## Working with Primitive Types

Generate schemas for primitive types:

```typescript
// String schema
const stringSchema = ClassSchema.generate(String);
// { "$id": "String", "type": "string" }

// Number schema
const numberSchema = ClassSchema.generate(Number);
// { "$id": "Number", "type": "number" }

// Boolean schema
const booleanSchema = ClassSchema.generate(Boolean);
// { "$id": "Boolean", "type": "boolean" }

// Array schema
const arraySchema = ClassSchema.generate(Array);
// { "$id": "Array", "type": "array" }

// Object schema
const objectSchema = ClassSchema.generate(Object);
// { "$id": "Object", "type": "object" }
```

## Configuration Options

### Schema Options

```typescript
interface SchemaOptions {
  $id?: string; // Schema identifier
  title?: string; // Schema title
  description?: string; // Schema description
  maxProperties?: number; // Maximum properties
  minProperties?: number; // Minimum properties
  patternProperties?: Record<string, Class<unknown>>;
  additionalProperties?: boolean | Class<unknown>; // Defaults to false
  if?: JSONSchema; // Conditional schema: if
  then?: JSONSchema; // Conditional schema: then
  else?: JSONSchema; // Conditional schema: else
}
```

Use `if`/`then`/`else` to embed JSON Schema conditional logic directly in the decorator:

```typescript
@Schema({
  if: { properties: { type: { const: 'a' } } },
  then: { required: ['aOnly'] },
  else: { required: ['bOnly'] },
})
class ConditionalExample {
  @Field({ const: 'a' })
  type: 'a' | 'b';

  @Field({ optional: true })
  aOnly?: string;

  @Field({ optional: true })
  bOnly?: string;
}
```

### Field Options

```typescript
interface BaseFieldSchema<T> {
  enum?: T[]; // Allowed values
  examples?: T[]; // Example values
  optional?: boolean; // Optional field
  requiredIf?: string; // Conditional requirement
  description?: string; // Field description
  const?: T; // Constant value
  nullable?: boolean; // Allow null values
}
```

## Error Handling

```typescript
try {
  // This will throw an error if class is not decorated with @Schema
  const schema = ClassSchema.generate(UndecoratedClass);
} catch (error) {
  console.error(error.message);
  // "Class 'UndecoratedClass' is not a schema. Add the @Schema() to the class"
}
```

## Integration Examples

### With Express.js

```typescript
import express from 'express';
import Ajv from 'ajv';
import { ClassSchema } from '@shadow-library/class-schema';

const app = express();
const ajv = new Ajv();

@Schema({ $id: 'CreateUserRequest' })
class CreateUserRequest {
  @Field({ format: 'email' })
  email: string;

  @Field({ minLength: 2 })
  name: string;
}

app.post('/users', (req, res) => {
  const schema = ClassSchema.generate(CreateUserRequest);
  const validate = ajv.compile(schema);

  if (!validate(req.body)) {
    return res.status(400).json({ errors: validate.errors });
  }

  // Process valid data...
});
```

### With Fastify

```typescript
import Fastify from 'fastify';
import { ClassSchema } from '@shadow-library/class-schema';

const fastify = Fastify();

@Schema({ $id: 'User' })
class User {
  @Field()
  name: string;

  @Field({ format: 'email' })
  email: string;
}

fastify.route({
  method: 'POST',
  url: '/users',
  schema: {
    body: ClassSchema.generate(User),
  },
  handler: async (request, reply) => {
    // Request body is automatically validated
    return { success: true };
  },
});
```

## TypeScript Integration

The library provides full TypeScript support:

```typescript
// Type-safe field picking
const keys = ['id', 'name'] as const;
class UserSummary extends PickType(User, keys) {}

// Type inference works correctly
const summary: UserSummary = {
  id: '123',
  name: 'John',
  // email is not required or allowed
};
```

## Best Practices

1. **Use descriptive schema IDs**: Always provide meaningful `$id` values
2. **Validate early**: Generate schemas at application startup
3. **Reuse schemas**: Use SchemaRegistry for better performance
4. **Type safety**: Leverage TypeScript's type system with utility types
5. **Document schemas**: Use `title` and `description` options
6. **Version schemas**: Include version information in schema IDs when needed

## API Reference

### Classes

- **`ClassSchema<T>`**: Main schema generator class
- **`SchemaRegistry`**: Registry for managing multiple schemas
- **`SchemaComposer`**: Utility for composing multiple schemas with `anyOf`, `oneOf`, discriminators, and enums
- **`TransformerFactory`**: Factory for creating data transformers

#### SchemaComposer Static Methods

##### `SchemaComposer.anyOf(...Classes)`

Creates a schema that matches any of the provided classes:

```typescript
const Contact = SchemaComposer.anyOf(EmailContact, PhoneContact);
```

##### `SchemaComposer.oneOf(...Classes)`

Creates a schema that matches exactly one of the provided classes:

```typescript
const User = SchemaComposer.oneOf(NativeUser, OAuthUser);
```

##### `SchemaComposer.discriminator(key, ...Classes)`

Creates a discriminated union schema with automatic mapping generation:

```typescript
const User = SchemaComposer.discriminator('type', NativeUser, OAuthUser);
// Generates schema with discriminator.mapping based on const values
```

#### EnumType

##### `EnumType.create(name, values, options?)`

Creates an enum schema for string or number values:

```typescript
// String enum
const Status = EnumType.create('Status', ['active', 'inactive', 'pending']);

// Number enum
const Priority = EnumType.create('Priority', [1, 2, 3, 4, 5]);

// With options
const Role = EnumType.create('Role', ['admin', 'user'], { description: 'User role' });
```

##### `enumType.toSchema()`

Converts the enum type to a JSON schema:

```typescript
const Status = EnumType.create('Status', ['active', 'inactive']);
console.log(Status.toSchema());
// { $id: 'class-schema:Status-enum-0', type: 'string', enum: ['active', 'inactive'] }
```

#### ClassSchema Static Methods

##### `ClassSchema.generate(Class)`

Generates a JSON schema from a class definition:

```typescript
@Schema()
class User {
  @Field()
  name: string;

  @Field()
  email: string;
}

const schema = ClassSchema.generate(User);
console.log(schema);
// Returns a branded ParsedSchema with complete JSON schema
```

##### `ClassSchema.isBranded(schema)`

Checks if a schema object was generated by this package. Returns `true` for schemas created by `ClassSchema.generate()` or `new ClassSchema()`, `false` for plain JSON schema objects:

```typescript
@Schema()
class Product {
  @Field()
  name: string;
}

// Generated schema is branded
const generatedSchema = ClassSchema.generate(Product);
console.log(ClassSchema.isBranded(generatedSchema)); // true

// Clone also preserves the brand
const clonedSchema = new ClassSchema(Product).getJSONSchema(true);
console.log(ClassSchema.isBranded(clonedSchema)); // true

// Plain JSON schema objects are not branded
const plainSchema = { $id: 'Plain', type: 'object' };
console.log(ClassSchema.isBranded(plainSchema)); // false
```

**Use Cases:**

- **Validation**: Ensure schemas are from this package before using with TransformerFactory
- **Type Safety**: Verify schema authenticity in runtime checks
- **Error Prevention**: Avoid passing incompatible schemas to package methods

```typescript
// TransformerFactory uses isBranded internally for validation
const factory = new TransformerFactory(field => field.format === 'date');

try {
  const transformer = factory.maybeCompile(generatedSchema); // ✅ Works
} catch (error) {
  // Won't happen - schema is branded
}

try {
  const transformer = factory.maybeCompile(plainSchema); // ❌ Throws error
} catch (error) {
  console.log(error.message);
  // "Invalid schema: only schemas built with this package are supported"
}
```

#### TransformerFactory Methods

##### `new TransformerFactory(filter)`

Creates a new transformer factory with a field filter function:

```typescript
const factory = new TransformerFactory(fieldSchema => fieldSchema.format === 'date-time');
```

##### `factory.compile(schema)`

Compiles a transformer function. Returns a no-op function if no fields match the filter:

```typescript
const transformer = factory.compile(schema);
const result = transformer(data, (value, fieldSchema, ctx) => transformedValue);
```

##### `factory.maybeCompile(schema)`

Compiles a transformer function. Returns `null` if no fields match the filter:

```typescript
const transformer = factory.maybeCompile(schema);
if (transformer) {
  const result = transformer(data, (value, fieldSchema, ctx) => transformedValue);
}
```

##### `factory.hasTransformableFields(schema)`

Checks if a schema contains any fields matching the filter criteria. Returns `true` if transformable fields exist, `false` otherwise. Throws an error if the schema is not branded:

```typescript
const factory = new TransformerFactory(fieldSchema => fieldSchema.format === 'date-time');

if (factory.hasTransformableFields(schema)) {
  // Schema has date-time fields
  const transformer = factory.compile(schema);
}
```

### Decorators

- **`@Schema(options?)`**: Mark class as schema
- **`@Field(options?)`**: Define field schema
- **`@Field(typeFn, options?)`**: Define field with explicit type

### Utility Functions

- **`PartialType<T>(Class)`**: Create partial version of schema
- **`PickType<T, K>(Class, keys)`**: Pick specific fields
- **`OmitType<T, K>(Class, keys)`**: Omit specific fields

### Constants

- **`Integer`**: Type for integer fields

## License

MIT © [shadow-library](https://github.com/shadow-library)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- 🐛 [Report bugs](https://github.com/shadow-library/class-schema/issues)
- 💡 [Request features](https://github.com/shadow-library/class-schema/issues)
- 📖 [Documentation](https://github.com/shadow-library/class-schema#readme)

---

Built with ❤️ by the Shadow Library team

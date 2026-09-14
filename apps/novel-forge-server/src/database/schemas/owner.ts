import { InferEnum } from 'drizzle-orm';
import { pgEnum } from 'drizzle-orm/pg-core';

export namespace Owner {
  export type Kind = InferEnum<typeof ownerKind>;
}

export const ownerKind = pgEnum('owner_kind', ['user', 'bot']);

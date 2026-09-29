/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Field, OmitType, PartialType, PickType, Schema, SchemaComposer } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { FastifyModule, FastifyRouter, Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
class Leaf {
  @Field()
  name: string;
}

@Schema()
class User {
  @Field()
  id: string;

  @Field()
  passwordHash: string;
}

@Schema()
class PublicUser extends OmitType(User, ['passwordHash']) {}

@Schema()
class Pet {
  @Field()
  petName: string;
}

@Schema()
class Car {
  @Field()
  model: string;
}

@Schema()
class Cat {
  @Field(() => String, { const: 'cat' })
  kind: 'cat';

  @Field()
  meow: string;
}

@Schema()
class Dog {
  @Field(() => String, { const: 'dog' })
  kind: 'dog';

  @Field()
  bark: string;
}

const PetOrCar = SchemaComposer.anyOf(Pet, Car);
const PetOrCarOne = SchemaComposer.oneOf(Pet, Car);
const Animal = SchemaComposer.discriminator('kind', Cat, Dog);

@Schema({ additionalProperties: Leaf })
class LeafMap {
  @Field()
  fixed: string;
}

@Schema({ patternProperties: { '^x-': Leaf } })
class PatternMap {
  @Field()
  fixed: string;
}

@Schema({ patternProperties: { '^x-': Leaf }, additionalProperties: false })
class PatternMapClosed {
  @Field()
  fixed: string;
}

@Schema()
class Inner {
  @Field(() => Leaf, { nullable: true })
  leaf: Leaf | null;
}

@Schema()
class Probe {
  @Field(() => Leaf)
  plain: Leaf;

  @Field(() => Leaf, { nullable: true })
  nullableRef: Leaf | null;

  @Field(() => [Leaf])
  list: Leaf[];

  @Field(() => [Leaf], { nullable: true })
  nullableList: Leaf[] | null;

  @Field(() => Inner, { nullable: true })
  nested: Inner | null;

  @Field(() => [Inner])
  nestedList: Inner[];

  @Field(() => PublicUser, { nullable: true })
  publicUser: PublicUser | null;

  @Field(() => [PublicUser])
  publicUsers: PublicUser[];

  @Field(() => PartialType(PickType(User, ['id'])), { nullable: true })
  pickedUser: Partial<Pick<User, 'id'>> | null;

  @Field(() => LeafMap, { nullable: true })
  leafMap: LeafMap | null;

  @Field(() => PatternMap, { nullable: true })
  patternMap: PatternMap | null;

  @Field(() => PatternMapClosed)
  patternMapClosed: PatternMapClosed;

  @Field(() => Object, { nullable: true })
  loose: object | null;
}

@Schema()
class UnionProbe {
  @Field(() => PetOrCar)
  anyOf: Pet | Car;

  @Field(() => PetOrCarOne)
  oneOf: Pet | Car;

  @Field(() => [Animal])
  animals: (Cat | Dog)[];
}

@Schema()
class Root {
  @Field()
  id: string;
}

const SECRET = { passwordHash: 'SECRET', contentHash: 'HASH' };
const leaf = (): object => ({ name: 'n', ...SECRET });

const probe = {
  ...SECRET,
  plain: leaf(),
  nullableRef: leaf(),
  list: [leaf(), leaf()],
  nullableList: [leaf()],
  nested: { leaf: leaf(), ...SECRET },
  nestedList: [
    { leaf: leaf(), ...SECRET },
    { leaf: null, ...SECRET },
  ],
  publicUser: { id: 'u1', ...SECRET },
  publicUsers: [{ id: 'u2', ...SECRET }],
  pickedUser: { id: 'u3', ...SECRET },
  leafMap: { fixed: 'f', extra: leaf() },
  patternMap: { fixed: 'f', 'x-one': leaf(), ...SECRET },
  patternMapClosed: { fixed: 'f', 'x-one': leaf(), ...SECRET },
  loose: { ...SECRET },
};

const unionProbe = {
  ...SECRET,
  anyOf: { petName: 'p', model: 'm', ...SECRET },
  oneOf: { petName: 'p', ...SECRET },
  animals: [
    { kind: 'cat', meow: 'm', ...SECRET },
    { kind: 'dog', bark: 'b', meow: 'x', ...SECRET },
  ],
};

@HttpController('/api')
class ProbeController {
  @Get('/probe')
  @RespondFor(200, Probe)
  probe(): object {
    return probe;
  }

  @Get('/union-probe')
  @RespondFor(200, UnionProbe)
  unionProbe(): object {
    return unionProbe;
  }

  @Get('/root-array')
  @RespondFor(200, [Root])
  rootArray(): object {
    return [{ id: '1', ...SECRET }];
  }

  @Get('/raw-closed')
  @RespondFor(200, { type: 'object', properties: { item: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false }, { type: 'null' }] } } })
  rawClosed(): object {
    return { item: { a: 'a', ...SECRET }, ...SECRET };
  }

  @Get('/raw-untyped-closed')
  @RespondFor(200, { type: 'object', properties: { item: { additionalProperties: false } } })
  rawUntypedClosed(): object {
    return { item: { a: 'a', ...SECRET } };
  }

  @Get('/raw-untyped-closed-items')
  @RespondFor(200, { type: 'object', properties: { items: { type: 'array', items: { additionalProperties: false } } } })
  rawUntypedClosedItems(): object {
    return { items: [{ a: 'a', ...SECRET }] };
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [ProbeController] })] })
class ProbeModule {}

describe('response serialization leaks', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(ProbeModule).then(app => app.start());
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  for (const path of ['/api/probe', '/api/union-probe', '/api/root-array', '/api/raw-closed', '/api/raw-untyped-closed', '/api/raw-untyped-closed-items']) {
    it(`should write no undeclared property for ${path}`, async () => {
      const response = await router.mockRequest().get(path);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('SECRET');
      expect(response.body).not.toContain('HASH');
    });
  }

  it('should serialize an untyped closed object as an empty object', async () => {
    const response = await router.mockRequest().get('/api/raw-untyped-closed');
    expect(response.json()).toStrictEqual({ item: {} });
  });

  it('should serialize an array of untyped closed objects as empty objects', async () => {
    const response = await router.mockRequest().get('/api/raw-untyped-closed-items');
    expect(response.json()).toStrictEqual({ items: [{}] });
  });
});

import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class ApiKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  id: bigint;
}

@Schema()
export class CreateApiKeyBody {
  @Field({ minLength: 1, maxLength: 100, description: 'Human-readable label; it is the only way to tell two keys apart once the secret is gone.' })
  name: string;
}

@Schema()
export class ApiKeyResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  name: string;

  @Field({ description: 'The first 8 characters of the secret, for identification only — it authenticates nothing.' })
  keyPrefix: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time', description: 'Recorded at most once a minute, so it lags real usage by up to 60 seconds.' })
  lastUsedAt?: Date | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  revokedAt?: Date | null;
}

@Schema()
export class CreateApiKeyResponse extends ApiKeyResponse {
  @Field({ description: 'The plaintext secret. Returned by this call alone — the server keeps only its hash and can never show it again.' })
  secret: string;
}

@Schema()
export class ListApiKeysResponse {
  @Field(() => [ApiKeyResponse])
  keys: ApiKeyResponse[];
}

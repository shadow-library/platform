import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Sensitive } from '@shadow-library/fastify';

import { CREDENTIAL_NAME_PATTERN, CREDENTIAL_TEST_CODES, type CredentialTestCode, SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from '@modules/credentials';

const CREDENTIAL_ID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const SECRET_PATTERN = '^[\\x21-\\x7e]+$';
const SECRET_MESSAGE = `The secret must be ${SECRET_MIN_LENGTH} to ${SECRET_MAX_LENGTH} visible ASCII characters, with no spaces`;
const SECRET_DESCRIPTION = 'The provider API key. Write-only: it is sealed on receipt, and no response ever carries it';

@Schema()
export class CredentialParams {
  @Field({ pattern: CREDENTIAL_ID_PATTERN, errorMessage: 'Expected a credential id' })
  id: string;
}

@Schema()
export class CreateCredentialBody {
  @Field({
    pattern: CREDENTIAL_NAME_PATTERN,
    description: 'Unique, and kept by a revoked credential',
    errorMessage: 'The name must be 1 to 64 lowercase letters, digits, dots, underscores or hyphens, starting with a letter or digit',
  })
  name: string;

  @Field({
    minLength: 1,
    maxLength: 300,
    description:
      'The only origin the key is ever sent to: scheme, host and optional port, e.g. `https://openrouter.ai`. Stored normalised, with the host lowercased and a default port dropped; a path is refused',
  })
  allowedOrigin: string;

  @Field({ minLength: SECRET_MIN_LENGTH, maxLength: SECRET_MAX_LENGTH, pattern: SECRET_PATTERN, description: SECRET_DESCRIPTION, errorMessage: SECRET_MESSAGE })
  @Sensitive()
  secret: string;
}

@Schema()
export class RotateCredentialBody {
  @Field({ minLength: SECRET_MIN_LENGTH, maxLength: SECRET_MAX_LENGTH, pattern: SECRET_PATTERN, description: SECRET_DESCRIPTION, errorMessage: SECRET_MESSAGE })
  @Sensitive()
  secret: string;
}

@Schema()
export class CredentialResponse {
  @Field({ description: 'Id a catalog provider names as `credential`' })
  id: string;

  @Field()
  name: string;

  @Field({ description: 'Normalised origin the key is bound to; a provider whose URL has another origin can neither publish nor call with it' })
  allowedOrigin: string;

  @Field({ description: 'At most a quarter of the secret: the first six and last four characters from 40 characters up, the last four from 16, else only `…`' })
  hint: string;

  @Field(() => Integer, { description: 'Starts at 1 and moves on every rotation' })
  version: number;

  @Field({ optional: true, description: 'The keyring key that wraps the secret' })
  kid?: string;

  @Field({ optional: true, description: 'Subject of the admin who created it, or `import` for the key imported from the environment' })
  createdBy?: string;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time', optional: true })
  rotatedAt?: Date;

  @Field(() => String, { format: 'date-time', optional: true, description: 'Set once revoked; a revoked credential is never used again' })
  revokedAt?: Date;

  @Field(() => [String], { description: 'Keys of the providers in the published catalog that name this credential' })
  referencedBy: string[];
}

@Schema()
export class CredentialListResponse {
  @Field(() => [CredentialResponse])
  items: CredentialResponse[];
}

@Schema({ description: 'The `CRED_IN_USE` error body: revoking is refused while the published catalog names the credential' })
export class CredentialInUseResponse {
  @Field()
  code: string;

  @Field()
  message: string;

  @Field(() => [String], { description: 'Keys of the providers in the published catalog that still name the credential' })
  referencedBy: string[];
}

@Schema()
export class CredentialTestResponse {
  @Field()
  ok: boolean;

  @Field(() => String, { enum: [...CREDENTIAL_TEST_CODES], optional: true, description: 'Why the test failed; the provider’s own response is never relayed' })
  code?: CredentialTestCode;
}

@Schema()
export class KeyringKeyResponse {
  @Field()
  kid: string;

  @Field(() => Integer, { description: 'Stored credentials, revoked ones included, whose secret this key wraps' })
  credentials: number;

  @Field({ description: 'False means every replica refuses to become ready until the key is put back' })
  inKeyring: boolean;
}

@Schema()
export class KeyringStatusResponse {
  @Field({ description: 'The key new secrets are sealed under; the background rewrap moves every row onto it' })
  activeKeyId: string;

  @Field(() => [KeyringKeyResponse], { description: 'A key can leave the keyring once its count is zero' })
  keys: KeyringKeyResponse[];
}

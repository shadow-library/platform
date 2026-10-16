import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class AdminAccessResponse {
  @Field(() => [String], { description: 'The Synapse user permissions the caller holds in the active organisation; empty when it holds none' })
  permissions: string[];
}

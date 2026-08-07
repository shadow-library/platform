import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class AdminContextResponse {
  @Field(() => [String], { description: 'Admin permissions held by the caller in the platform organisation; an empty array means the caller is not staff.' })
  permissions: string[];
}

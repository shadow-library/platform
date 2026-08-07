import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class MyApplicationItem {
  @Field(() => Number)
  id: number;

  @Field()
  name: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  displayName?: string;

  @Field()
  subDomain: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  homePageUrl?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  logoUrl?: string;

  @Field(() => String, { optional: true, description: 'Present only after the user has opened the application; omitted for accessible but unused applications.' })
  @Transform('strip:null')
  firstUsedAt?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  lastUsedAt?: string;
}

@Schema()
export class MyApplicationsResponse {
  @Field(() => [MyApplicationItem])
  applications: MyApplicationItem[];
}

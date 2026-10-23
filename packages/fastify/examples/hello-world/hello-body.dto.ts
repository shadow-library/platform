import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class HelloBody {
  @Field(() => String, { minLength: 3, maxLength: 12, description: 'Name of the person to greet' })
  name: string;
}

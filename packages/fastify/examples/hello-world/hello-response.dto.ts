import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class HelloResponse {
  @Field()
  message: string;
}

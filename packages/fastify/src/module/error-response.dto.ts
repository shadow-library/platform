/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ErrorFieldDto {
  @Field()
  field: string;

  @Field()
  msg: string;
}

@Schema()
export class ErrorResponseDto {
  @Field()
  code: string;

  @Field()
  type: string;

  @Field()
  message: string;

  @Field(() => [ErrorFieldDto], { optional: true })
  fields?: ErrorFieldDto[];
}

@Schema()
export class DevErrorResponseDto extends ErrorResponseDto {
  @Field({ optional: true })
  stack?: string;
}

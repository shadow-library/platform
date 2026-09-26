import { Field, Schema } from '@shadow-library/class-schema';
import { ErrorResponseDto } from '@shadow-library/fastify';

@Schema({ description: 'A locked secret a plan would reveal, named by its title alone.' })
export class RevealRuleViolationItem {
  @Field()
  factKey: string;

  @Field({ description: "The secret's title, never its truth." })
  label: string;

  @Field(() => [String], { description: 'What still has to hold before the plan may reveal it, read as words.' })
  missing: string[];
}

@Schema()
export class RevealRuleDetails {
  @Field(() => [RevealRuleViolationItem])
  violations: RevealRuleViolationItem[];
}

@Schema({ description: 'A reveal-rule refusal (PLN_001): the plan being written reveals a secret still locked at its chapter.' })
export class RevealRuleErrorResponse extends ErrorResponseDto {
  @Field(() => RevealRuleDetails, { optional: true, description: 'Present on PLN_001: each locked secret the plan would reveal and what it still needs.' })
  details?: RevealRuleDetails;
}

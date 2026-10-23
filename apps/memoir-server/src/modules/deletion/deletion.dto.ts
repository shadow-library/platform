import { Field, Schema } from '@shadow-library/class-schema';

import { DeletionState } from '@server/classes';

@Schema()
export class DeletionStatusDto {
  @Field(() => DeletionState, {
    description:
      "Where the account sits in the irreversible deletion state machine. 'none' means no deletion has been started; 'done' also answers for an account whose row has already been removed. From anything other than 'none' every other API surface refuses this account with ACC_002.",
  })
  deletionState: string;
}

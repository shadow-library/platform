import { PartialType, Schema } from '@shadow-library/class-schema';

import { CreateUserBody } from './create-user-body.dto';

@Schema()
export class UpdateUserBody extends PartialType(CreateUserBody) {}

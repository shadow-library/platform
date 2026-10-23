import { PickType, Schema } from '@shadow-library/class-schema';

import { UserResponse } from './user-response.dto';

@Schema()
export class UserParams extends PickType(UserResponse, ['id'] as const) {}

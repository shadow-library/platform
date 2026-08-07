import { Handler } from '@shadow-library/app';

import { type AuthOptions } from './access.types';

type AccessDecorator = ClassDecorator & MethodDecorator;

export const ACCESS_METADATA = 'access';

export const Auth = (options: AuthOptions = {}): AccessDecorator => Handler({ [ACCESS_METADATA]: options });

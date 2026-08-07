import { Handler } from '@shadow-library/app';

type PublicDecorator = ClassDecorator & MethodDecorator;

export const PUBLIC_ROUTE_METADATA = 'pulsePublic';

export const Public = (): PublicDecorator => Handler({ [PUBLIC_ROUTE_METADATA]: true });

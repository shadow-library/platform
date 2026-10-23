import { Handler } from '@shadow-library/app';

type PublicDecorator = ClassDecorator & MethodDecorator;

export const PUBLIC_ROUTE_METADATA = 'synapsePublic';

/** @public The default-deny sentinel's opt-out, kept for the first route that must be reachable without a session. */
export const Public = (): PublicDecorator => Handler({ [PUBLIC_ROUTE_METADATA]: true });

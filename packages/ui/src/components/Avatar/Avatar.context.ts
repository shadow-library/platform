import { createContext } from 'react';

import { type AvatarSize } from './Avatar.types';

/** Set by AvatarGroup so nested avatars inherit its size unless they set their own. */
export const AvatarGroupContext = createContext<AvatarSize | undefined>(undefined);

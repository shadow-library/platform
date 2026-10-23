import { createContext } from 'react';

import { type AvatarSize } from './Avatar.types';

export const AvatarGroupContext = createContext<AvatarSize | undefined>(undefined);

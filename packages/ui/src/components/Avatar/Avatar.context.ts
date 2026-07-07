/**
 * Importing npm packages
 */
import { createContext } from 'react';

/**
 * Importing user defined packages
 */
import { type AvatarSize } from './Avatar.types';

/**
 * Declaring the constants
 */

/** Set by AvatarGroup so nested avatars inherit its size unless they set their own. */
export const AvatarGroupContext = createContext<AvatarSize | undefined>(undefined);

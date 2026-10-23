import { createContext } from 'react';

/** True while an item renders inside the "More" popover, so it skins itself as a menu row. */
export const TopNavigationOverflowContext = createContext(false);

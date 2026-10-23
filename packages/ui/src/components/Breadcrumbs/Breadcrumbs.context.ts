import { createContext } from 'react';

/** True while a crumb renders inside the "…" popover, so it skins itself as a menu row. */
export const BreadcrumbsOverflowContext = createContext(false);

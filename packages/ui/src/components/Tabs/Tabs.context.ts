import { createContext } from 'react';

/** The selected tab's value, so a `keepMounted` panel can hide itself while inactive. */
export const TabsValueContext = createContext('');

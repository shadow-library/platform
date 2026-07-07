/**
 * Importing npm packages
 */
import { createContext } from 'react';

/**
 * Declaring the constants
 */
export const AccordionContext = createContext<{ variant: 'plain' | 'contained'; headingLevel: 1 | 2 | 3 | 4 | 5 | 6 }>({ variant: 'plain', headingLevel: 3 });

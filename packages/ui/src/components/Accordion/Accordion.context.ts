import { createContext } from 'react';

export const AccordionContext = createContext<{ variant: 'plain' | 'contained'; headingLevel: 1 | 2 | 3 | 4 | 5 | 6 }>({ variant: 'plain', headingLevel: 3 });

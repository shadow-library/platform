/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface ClientOnlyProps {
  children: ReactNode;
  /** Rendered on the server and until the client mounts. @default null */
  fallback?: ReactNode;
}

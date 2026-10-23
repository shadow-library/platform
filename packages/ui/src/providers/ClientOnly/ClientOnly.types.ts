import { type ReactNode } from 'react';

export interface ClientOnlyProps {
  children: ReactNode;
  /** Rendered on the server and until the client mounts. @default null */
  fallback?: ReactNode;
}

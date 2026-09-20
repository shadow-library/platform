import { createContext, type ReactElement, type ReactNode, useContext, useId } from 'react';
import { Spinner } from '@shadow-library/ui';

import { MemoirMark } from './icons';
import styles from './StatusPage.module.css';

export type StatusPageVariant = 'page' | 'region';

const StatusPageVariantContext = createContext<StatusPageVariant>('page');

/** Inside the shell, which already owns the `<main>` landmark and the brand, a status is a region of the content column. */
export function StatusRegion({ children }: { children: ReactNode }): ReactElement {
  return <StatusPageVariantContext.Provider value="region">{children}</StatusPageVariantContext.Provider>;
}

export function useStatusPageVariant(): StatusPageVariant {
  return useContext(StatusPageVariantContext);
}

export function StatusBrand(): ReactElement {
  return (
    <span className={styles.brand}>
      <MemoirMark size={18} />
      Memoir
    </span>
  );
}

export interface StatusPageProps {
  title: string;
  description?: ReactNode;
  pending?: boolean;
  actions?: ReactNode;
  /** Defaults to `region` under a `StatusRegion`, `page` elsewhere. */
  variant?: StatusPageVariant;
}

export function StatusPage({ title, description, pending = false, actions, variant }: StatusPageProps): ReactElement {
  const inherited = useStatusPageVariant();
  const resolved = variant ?? inherited;
  const Root = resolved === 'page' ? 'main' : 'section';
  const titleId = useId();

  return (
    <Root className={styles.root} data-variant={resolved} aria-busy={pending || undefined} aria-labelledby={titleId}>
      <div className={styles.panel}>
        {resolved === 'page' ? <StatusBrand /> : null}
        {pending ? <Spinner size="lg" aria-hidden="true" /> : null}
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </Root>
  );
}

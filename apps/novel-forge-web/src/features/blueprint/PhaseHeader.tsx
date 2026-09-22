import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';

import { BLUEPRINT_PHASE_COUNT, type BlueprintAltitude } from './blueprint-phases';
import styles from './blueprint.module.css';

export interface PhaseHeaderProps {
  phaseNumber: number;
  altitude: BlueprintAltitude;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /**
   * Moves focus to the heading whenever it changes — pass the step key. Nothing else in a seven-phase
   * keyboard flow tells a screen reader that a lock finished and a different step is on screen.
   */
  focusKey: string;
}

export function PhaseHeader({ phaseNumber, altitude, title, description, actions, focusKey }: PhaseHeaderProps): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <header className={styles.phaseHeader}>
      <div className={styles.phaseHeaderMain}>
        <span className="nf-eyebrow">
          Phase {phaseNumber} of {BLUEPRINT_PHASE_COUNT} · {altitude.toLowerCase()}
        </span>
        <h1 className={styles.phaseTitle} ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {description != null && <p className={styles.phaseLede}>{description}</p>}
      </div>
      {actions != null && <div className={styles.phaseHeaderActions}>{actions}</div>}
    </header>
  );
}

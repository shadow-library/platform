import { type ReactElement } from 'react';

import controls from './controls.module.css';

export interface LiveVersionHintProps {
  version: number;
  canEdit: boolean;
  readOnlyNote?: string;
}

export function LiveVersionHint({ version, canEdit, readOnlyNote }: LiveVersionHintProps): ReactElement {
  const note = canEdit ? 'Each change goes live as soon as you confirm it.' : readOnlyNote;
  return (
    <p className={controls.hint}>
      Showing live version {version}.{note ? ` ${note}` : null}
    </p>
  );
}

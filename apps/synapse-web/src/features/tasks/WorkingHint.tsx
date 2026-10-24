import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import controls from '@/features/shared/controls.module.css';

import { type WorkingSource } from './use-working-catalog';

export function WorkingHint({ source }: { source: WorkingSource }): ReactElement {
  if (source.kind === 'active') return <p className={controls.hint}>Showing published version {source.version}. Edits start a draft that changes nothing until it is published.</p>;
  return (
    <p className={controls.hint}>
      Showing the draft, including changes not yet published
      {source.activeVersion === null ? '; nothing has been published yet' : ` over version ${source.activeVersion}`}. <Link to="/changes">Review changes</Link>
    </p>
  );
}

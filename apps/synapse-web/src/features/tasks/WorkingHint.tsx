import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { type WorkingSource } from '@/features/catalog';
import controls from '@/features/shared/controls.module.css';

export function WorkingHint({ source, canEdit }: { source: WorkingSource; canEdit: boolean }): ReactElement {
  if (source.kind === 'active')
    return (
      <p className={controls.hint}>
        Showing published version {source.version}.{canEdit ? ' Edits start a draft that changes nothing until it is published.' : null}
      </p>
    );
  return (
    <p className={controls.hint}>
      Showing the draft, including changes not yet published
      {source.activeVersion === null ? '; nothing has been published yet' : ` over version ${source.activeVersion}`}. <Link to="/changes">Review changes</Link>
    </p>
  );
}

import { type ReactElement, type ReactNode } from 'react';

import form from './form.module.css';

export function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): ReactElement {
  return (
    <section className={form.formSection}>
      <div>
        <h3 className={form.formSectionTitle}>{title}</h3>
        {hint ? <p className={form.formSectionHint}>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

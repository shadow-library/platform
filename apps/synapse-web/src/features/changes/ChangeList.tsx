import { type ReactElement } from 'react';

import { type CatalogChange } from '@/features/catalog';

import { type ChangeLine, summarizeChanges } from './change-summary';
import styles from './Changes.module.css';

function ChangeLineText({ line }: { line: ChangeLine }): ReactElement {
  if (line.kind === 'text') return <>{line.text}</>;
  return (
    <>
      {line.lead}: <span className={styles.before}>{line.before}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <span className="sr-only"> changes to </span>
      <span className={styles.after}>{line.after}</span>
      {line.suffix}
    </>
  );
}

export function ChangeList({ changes }: { changes: readonly CatalogChange[] }): ReactElement {
  const groups = summarizeChanges(changes);
  if (groups.length === 0) return <p className={styles.itemLabel}>Technical settings that this console can&apos;t describe in words.</p>;
  return (
    <>
      {groups.map(group => (
        <section key={group.area} aria-label={group.title}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <div className={styles.items}>
            {group.items.map(item => (
              <div key={item.key}>
                <p className={styles.itemLabel}>{item.label}</p>
                <ul className={styles.lines} aria-label={`Changes to ${item.label}`}>
                  {item.lines.map((line, index) => (
                    <li key={index}>
                      <ChangeLineText line={line} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

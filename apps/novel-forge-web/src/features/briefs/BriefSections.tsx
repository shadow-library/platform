import { Alert } from '@shadow-library/ui';

import { type BriefResponse } from '@/lib/apis';
import { endingContractOf, parseBriefBody } from '@/lib/chapter-brief';

import styles from './BriefSections.module.css';

export interface DetailFieldProps {
  label: string;
  value?: string | null;
}

export function DetailField({ label, value }: DetailFieldProps): React.JSX.Element | null {
  if (!value) return null;
  return (
    <>
      <h2 className={styles.sectionLabel}>{label}</h2>
      <p className={styles.fieldText}>{value}</p>
    </>
  );
}

export function BriefSections({ brief }: { brief: BriefResponse }): React.JSX.Element {
  const sections = parseBriefBody(brief.body);
  const ending = endingContractOf(brief.endingContract);
  const readerValue = (brief.readerValue ?? []).map(value => value.replace(/_/g, ' '));

  return (
    <div className={styles.briefSections}>
      {brief.densityRisk && (
        <Alert intent="warning" title="Too thin for a full chapter" className={styles.notice}>
          {brief.densityRisk} — merge it with a neighbour or add material to the brief, or the drafter will pad it to length.
        </Alert>
      )}
      <DetailField label="Purpose" value={brief.chapterPurpose} />
      {sections.map((section, i) => (
        <section key={`${section.heading ?? 'body'}-${i}`} className={styles.briefSection}>
          {section.heading && <h2 className={styles.sectionLabel}>{section.heading}</h2>}
          {section.paragraphs.map((paragraph, j) => (
            <p key={j} className={styles.briefParagraph}>
              {paragraph}
            </p>
          ))}
          {section.items.length > 0 && (
            <ul className={styles.briefList}>
              {section.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <DetailField label="POV" value={brief.pov} />
      {ending && (
        <section className={styles.briefSection}>
          <h2 className={styles.sectionLabel}>Ending</h2>
          <dl className={styles.endingGrid}>
            {ending.hookType && (
              <>
                <dt>Hook</dt>
                <dd>{ending.hookType}</dd>
              </>
            )}
            {ending.emotionalBeat && (
              <>
                <dt>Feeling</dt>
                <dd>{ending.emotionalBeat}</dd>
              </>
            )}
            {ending.openQuestion && (
              <>
                <dt>Open question</dt>
                <dd>{ending.openQuestion}</dd>
              </>
            )}
            {ending.handoffState && (
              <>
                <dt>Hands off</dt>
                <dd>{ending.handoffState}</dd>
              </>
            )}
            {ending.mustNotResolve.length > 0 && (
              <>
                <dt>Leave open</dt>
                <dd>{ending.mustNotResolve.join(', ')}</dd>
              </>
            )}
          </dl>
        </section>
      )}
      <DetailField label="Delivers" value={readerValue.join(', ')} />
      <DetailField label="Avoid repeating" value={(brief.repetitionRisks ?? []).join('; ')} />
      <DetailField label="Author guidance" value={brief.guidance} />
    </div>
  );
}

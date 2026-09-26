import { describe, expect, it } from 'bun:test';

import { type AuditRows, describeChecked, renderAuditMaterial, secretFacts } from '@modules/audit/bible-audit-material';

function rows(overrides: Partial<AuditRows> = {}): AuditRows {
  return {
    documents: [
      { section: 'world', slug: 'geography', body: 'Saltgate keeps ten lanterns.' },
      { section: 'plot', slug: 'outline', body: 'Mara searches for her father.' },
      { section: 'plot', slug: 'empty', body: '' },
    ],
    entities: [
      { entityKey: 'mara', type: 'character', name: 'Mara', status: 'alive', motivation: null, notes: null, body: null },
      { entityKey: 'saltgate', type: 'location', name: 'Saltgate', status: null, motivation: null, notes: null, body: null },
    ],
    facts: [
      {
        factKey: 'lamp_heir',
        text: 'Mara is the lost heir.',
        writerNote: 'Hint at her warmth.',
        terms: ['heir'],
        allowedClues: null,
        revealChapter: 9,
        disclosedInChapter: null,
        source: 'manual',
      },
      {
        factKey: 'ten_lanterns',
        text: 'The harbour keeps ten lanterns.',
        writerNote: null,
        terms: null,
        allowedClues: null,
        revealChapter: 1,
        disclosedInChapter: 1,
        source: 'manual',
      },
    ],
    chapters: [
      { number: 1, title: 'The Count', summary: 'Mara counts the lanterns.' },
      { number: 2, title: 'The Quay', summary: 'Mara meets the harbour master.' },
    ],
    isolatedChapters: [],
    ...overrides,
  };
}

const BOTH_RAN = { coverage: 'ran', contradictions: 'ran' } as const;

describe('renderAuditMaterial', () => {
  it('should label every source and mark a secret the reader has not been told', () => {
    const material = renderAuditMaterial(rows());

    expect(material.rendered).toContain('[doc:world/geography]\nSaltgate keeps ten lanterns.');
    expect(material.rendered).toContain('[fact:lamp_heir]\nSECRET — the reader has not been told. Mara is the lost heir.');
    expect(material.rendered).toContain('[fact:ten_lanterns]\nThe harbour keeps ten lanterns.');
    expect(material.rendered).toContain('[chapter:2]\nThe Quay\nMara meets the harbour master.');
    expect([...material.sources.keys()]).not.toContain('doc:plot/empty');
  });

  it('should read part of an overlong page and say so', () => {
    const long = Array.from({ length: 2000 }, (_, i) => `Sentence ${i} about the harbour.`).join(' ');
    const material = renderAuditMaterial(rows({ documents: [{ section: 'world', slug: 'geography', body: long }] }));

    expect(material.examined.documents.clipped).toBe(1);
    expect(describeChecked(BOTH_RAN, rows({ documents: [{ section: 'world', slug: 'geography', body: long }] }), material).copy).toContain(
      '1 page was too long and only partly read.',
    );
  });
});

describe('secretFacts', () => {
  it('should treat only undisclosed facts as secrets', () => {
    expect(secretFacts(rows().facts).map(fact => fact.factKey)).toEqual(['lamp_heir']);
  });
});

describe('describeChecked', () => {
  it('should name finalized isolated chapters, which it never reads', () => {
    const firewalled = rows({ isolatedChapters: [7] });

    const checked = describeChecked(BOTH_RAN, firewalled, renderAuditMaterial(firewalled));

    expect(checked.copy).toBe('Checked: 2 pages, 1 character, 1 place, 2 facts, chapters 1–2. Chapter 7 is isolated, so not compared.');
    expect(checked.chaptersIsolated).toEqual([7]);
  });

  it('should keep the most recent chapters when their summaries run over budget', () => {
    const summary = Array.from({ length: 150 }, (_, i) => `Word${i}`).join(' ');
    const many = rows({ chapters: Array.from({ length: 80 }, (_, i) => ({ number: i + 1, title: null, summary })) });

    const checked = describeChecked(BOTH_RAN, many, renderAuditMaterial(many));

    expect(checked.chapters?.to).toBe(80);
    expect(checked.chapters?.from).toBeGreaterThan(1);
    expect(checked.chaptersOmitted).toBe((checked.chapters?.from ?? 1) - 1);
  });

  it('should list the pages, records, facts and chapter range a clean audit read', () => {
    const checked = describeChecked(BOTH_RAN, rows(), renderAuditMaterial(rows()));

    expect(checked.copy).toBe('Checked: 2 pages, 1 character, 1 place, 2 facts, chapters 1–2.');
    expect(checked.chapters).toEqual({ from: 1, to: 2, count: 2 });
  });

  it('should claim no facts or chapters when the contradiction check did not run', () => {
    const checked = describeChecked({ coverage: 'ran', contradictions: 'failed' }, rows(), renderAuditMaterial(rows()));

    expect(checked.copy).toBe('Checked: 2 pages, 1 character, 1 place. The contradiction check did not run, so facts and chapters were not compared.');
    expect(checked.facts.count).toBe(0);
    expect(checked.chapters).toBeNull();
  });

  it('should name finalized chapters that had no summary to compare', () => {
    const withGap = rows({ chapters: [...rows().chapters, { number: 3, title: null, summary: null }] });

    const checked = describeChecked(BOTH_RAN, withGap, renderAuditMaterial(withGap));

    expect(checked.copy).toBe('Checked: 2 pages, 1 character, 1 place, 2 facts, chapters 1–2. Chapter 3 has no summary yet, so not compared.');
  });

  it('should say so when nothing has been finalized', () => {
    const early = rows({ chapters: [] });

    expect(describeChecked(BOTH_RAN, early, renderAuditMaterial(early)).copy).toBe('Checked: 2 pages, 1 character, 1 place, 2 facts, no finalized chapter summaries.');
  });
});

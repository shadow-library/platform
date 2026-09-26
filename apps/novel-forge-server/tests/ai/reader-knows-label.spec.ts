import { afterEach, describe, expect, it } from 'bun:test';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { type ContextSection } from '@modules/ai/context/sections';
import { WRITER_OPTIONAL_PRIORITY } from '@modules/ai/context/writer-context';
import { loadWriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';

import { writerAssembler, writerDb, writerTables } from './writer-disclosure-fixtures';

const CURSE = 'The first keeper drowned the pier builders to seal the door.';

function withReaderSecret() {
  const tables = writerTables('locked');
  tables.get('canonFacts')?.push({
    id: 40n,
    projectId: 7n,
    factKey: 'pier_curse',
    text: CURSE,
    constraintNote: null,
    writerNote: 'Oren flinches at the pier pilings.',
    terms: ['drowned builders'],
    revealChapter: null,
    unlock: null,
    allowedClues: null,
    source: 'manual',
    plannedChapter: null,
    disclosedInChapter: 3,
  });
  return writerDb(tables);
}

async function readerKnowsSection(): Promise<ContextSection | undefined> {
  const db = withReaderSecret();
  const disclosure = await loadWriterDisclosurePolicy(db as never, 7n, 5);
  const pack = await writerAssembler(db).forChapter(7n, 5, { dryRun: true, disclosure });
  return pack.sections.find(section => section.key === 'reader_knows');
}

describe('ContextAssembler.forChapter — the reader-knows label', () => {
  let restore: RestoreConfig | undefined;
  afterEach(() => restore?.());

  it('should send nothing the reader knows and the cast does not while the flag is off', async () => {
    restore = setConfig({ 'knowledge.reader-knows-label': false });

    expect(await readerKnowsSection()).toBeUndefined();
  });

  it('should label what the reader was shown and the POV cast was not when the flag is on, as optional material with its constraint', async () => {
    restore = setConfig({ 'knowledge.reader-knows-label': true });

    const section = await readerKnowsSection();

    expect(section?.rendered).toBe(`## THE READER KNOWS (THE POV CAST DOES NOT)\n\n- [pier_curse] ${CURSE} — the reader knows; Oren does not — Oren flinches at the pier pilings.`);
    expect(section?.required).toBeUndefined();
    expect(section?.priority).toBe(WRITER_OPTIONAL_PRIORITY.readerKnows);
  });
});

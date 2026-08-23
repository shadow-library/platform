import { describe, expect, it } from 'bun:test';

import { computeAnalysisSignals, type SignalCandidate, type SignalChapter } from '@modules/reforge/analysis-signals';

const NAMES = ['Ren', 'Kaia', 'Doran', 'Vesh', 'Miral', 'Torhen', 'Selis', 'Adran', 'Fenrick', 'Lomas'];
const WORDS = `lantern ledger gate blade letter road weighed answered measured turned considered balanced watched cold rain iron salt
  merchant courier banner rope ash harbour tide oath debt winter smoke bell rope glass wheel furnace orchard shutter frost hollow
  tally verdict lantern ledger quarry brine thorn kestrel marrow signal cinder trellis vellum tallow harrow gantry pallid quill`.split(/\s+/);

// A deterministic PRNG keeps the corpus reproducible while making cross-chapter 8-gram collisions
// vanishingly unlikely, so a planted repeat is the only repeat the detector can find.
function randomizer(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let t = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** A unique name per chapter, so only a chapter that introduces nobody reads as static. */
function newcomer(seed: number): string {
  const first = ['Bra', 'Cor', 'Dal', 'Els', 'Fyn', 'Gar', 'Hal', 'Isk', 'Jor', 'Kel'][seed % 10] as string;
  const second = ['mund', 'wyn', 'thas', 'rin', 'vell', 'dor', 'sath', 'quin', 'lir', 'nem'][Math.floor(seed / 10) % 10] as string;
  return `${first}${second}`;
}

function prose(seed: number, cast: string[], sentences = 20): string {
  const next = randomizer(seed);
  const lines: string[] = [];
  for (let i = 0; i < sentences; i++) {
    const words = Array.from({ length: 12 }, () => WORDS[Math.floor(next() * WORDS.length)] as string);
    lines.push(`${cast[Math.floor(next() * cast.length)] as string} ${words.join(' ')}.`);
  }
  return lines.join(' ');
}

function speech(seed: number): string {
  const next = randomizer(seed + 977);
  return Array.from(
    { length: 8 },
    () => `"${Array.from({ length: 6 }, () => WORDS[Math.floor(next() * WORDS.length)] as string).join(' ')}," ${NAMES[seed % NAMES.length] as string} said.`,
  ).join(' ');
}

/** A normal chapter: fresh prose, a newcomer, and dialogue above the stall floor. */
function livingChapter(seed: number, cast: string[] = NAMES): string {
  return `${prose(seed, [...cast, newcomer(seed)])} ${speech(seed)}`;
}

/** The same tournament fight, reused verbatim — the failure mode the shingle detector exists to find. */
const REPEATED_SCENE = prose(90210, ['Ren', 'Kaia'], 16);

function chapter(number: number, body: string, title?: string, wordCount?: number): SignalChapter {
  return { chapter: number, title: title ?? `Chapter ${number}`, body, wordCount: wordCount ?? body.split(/\s+/).length };
}

function ofType(candidates: SignalCandidate[], type: SignalCandidate['type']): SignalCandidate[] {
  return candidates.filter(c => c.type === type);
}

describe('computeAnalysisSignals', () => {
  it('should return an empty digest for an empty corpus', () => {
    const signals = computeAnalysisSignals([]);
    expect(signals.candidates).toHaveLength(0);
    expect(signals.metrics).toMatchObject({ chapterCount: 0, repetitionRatio: 0, deadThreadCount: 0 });
  });

  it('should cluster a planted repeated arc and leave clean chapters out of it', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 20; i++) {
      const planted = [4, 9, 14].includes(i);
      chapters.push(chapter(i, planted ? `${REPEATED_SCENE} ${livingChapter(i)}` : livingChapter(i)));
    }

    const { candidates, metrics } = computeAnalysisSignals(chapters);
    const repetition = ofType(candidates, 'repetition');
    expect(repetition).toHaveLength(1);
    expect(repetition[0]?.evidence['chapters']).toEqual([4, 9, 14]);
    expect(repetition[0]?.evidence['examples']).not.toHaveLength(0);
    expect(metrics.repetitionRatio).toBeCloseTo(0.15, 5);
  });

  it('should see through a rename when the glossary maps it', () => {
    const renamed = REPEATED_SCENE.replace(/Ren/g, 'Aurel');
    const chapters = [chapter(1, `${REPEATED_SCENE} ${livingChapter(1)}`), chapter(2, livingChapter(2)), chapter(3, `${renamed} ${livingChapter(3)}`)];

    const withoutGlossary = computeAnalysisSignals(chapters);
    const withGlossary = computeAnalysisSignals(chapters, { glossary: [{ sourceName: 'Aurel', replacement: 'Ren', category: 'character' }] });

    expect(ofType(withGlossary.candidates, 'repetition')[0]?.evidence['peakSimilarity']).toBeGreaterThan(
      Number(ofType(withoutGlossary.candidates, 'repetition')[0]?.evidence['peakSimilarity'] ?? 0),
    );
  });

  it('should flag a run of short chapters as padding and an isolated giant as an outlier', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 20; i++) {
      const words = i >= 8 && i <= 11 ? 300 : i === 15 ? 9000 : 2000;
      chapters.push(chapter(i, livingChapter(i), undefined, words));
    }

    const { candidates } = computeAnalysisSignals(chapters);
    const filler = ofType(candidates, 'filler');
    expect(filler).toHaveLength(1);
    expect(filler[0]).toMatchObject({ fromChapter: 8, toChapter: 11 });

    const giants = ofType(candidates, 'quality_outlier');
    expect(giants).toHaveLength(1);
    expect(giants[0]).toMatchObject({ fromChapter: 15, toChapter: 15 });
  });

  it('should flag a recap run that introduces no one and barely speaks', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 12; i++) {
      const stall = i >= 6 && i <= 8;
      chapters.push(chapter(i, stall ? prose(i, NAMES.slice(0, 3)) : livingChapter(i)));
    }

    const stalls = ofType(computeAnalysisSignals(chapters).candidates, 'pacing_stall');
    expect(stalls).toHaveLength(1);
    expect(stalls[0]).toMatchObject({ fromChapter: 6, toChapter: 8 });
  });

  it('should flag a planted dropped thread and ignore a thread that runs to the end', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 40; i++) {
      const abandoned = i <= 8 ? ' Tallis pressed the tribunal for a verdict.'.repeat(2) : '';
      chapters.push(chapter(i, `${prose(i, ['Ren', 'Kaia'])}${abandoned}`));
    }

    const dropped = ofType(computeAnalysisSignals(chapters, { deadThreadGap: 20 }).candidates, 'dropped_thread');
    expect(dropped.map(c => c.evidence['name'])).toContain('Tallis');
    expect(dropped.map(c => c.evidence['name'])).not.toContain('Ren');
    expect(computeAnalysisSignals(chapters, { deadThreadGap: 20 }).metrics.deadThreadCount).toBe(dropped.length);
  });

  it('should read a title-stem run as an arc boundary', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 12; i++) {
      const title = i >= 5 && i <= 9 ? `Chapter ${i}: Trial of the Ash Court ${i - 4}` : `Chapter ${i}: The Long Road`;
      chapters.push(chapter(i, livingChapter(i), title));
    }

    const arcs = ofType(computeAnalysisSignals(chapters).candidates, 'arc_boundary');
    expect(arcs.some(a => a.fromChapter === 5 && a.toChapter === 9)).toBe(true);
  });

  it('should sort candidates by source chapter so a window digest slices contiguously', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 20; i++) {
      const words = i >= 8 && i <= 11 ? 300 : 2000;
      chapters.push(chapter(i, [4, 9, 14].includes(i) ? `${REPEATED_SCENE} ${livingChapter(i)}` : livingChapter(i), undefined, words));
    }

    const froms = computeAnalysisSignals(chapters).candidates.map(c => c.fromChapter);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
  });

  it('should finish a 2,000-chapter corpus at MTL chapter length inside the analysis budget', () => {
    const chapters: SignalChapter[] = [];
    for (let i = 1; i <= 2000; i++) chapters.push(chapter(i, `${prose(i, [...NAMES, newcomer(i)], 150)} ${speech(i)}`));

    const started = performance.now();
    const signals = computeAnalysisSignals(chapters);
    expect(performance.now() - started).toBeLessThan(30_000);
    expect(signals.metrics.chapterCount).toBe(2000);
  }, 120_000);
});

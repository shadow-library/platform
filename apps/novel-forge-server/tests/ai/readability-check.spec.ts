import { describe, expect, it } from 'bun:test';

import {
  assessReadability,
  AVERAGE_PARAGRAPH_WORDS_MAX,
  ORNATE_HITS_MIN,
  ORNATE_HITS_PER_1000_WORDS_MAX,
  READABILITY_PREFIX,
  readabilityNote,
  renderReadabilityEvidence,
} from '@modules/ai/graphs/readability-check';

const PLAIN_SCENE = `Mara reached the gate an hour after dark.

The guard didn't look up. "Name?"

"Mara Venn. I'm here for the trial."

He checked a list. Then he checked it again. "You're late."

"The ferry broke down."

"Everyone's ferry breaks down." He waved her through. "Hall's on the left. Don't touch anything glowing."

She walked fast. The courtyard was full of students in grey coats. Most of them were older than her, and a few of them stared at her wet boots as she passed.

Inside, a woman with short white hair stood behind a long table. Seven stones sat in a row in front of her. Each one was the size of a fist.

"Late," the woman said. "Sit on the bench and watch. You go last."`;

const PLAIN_CHAPTER = Array.from({ length: 8 }, () => PLAIN_SCENE).join('\n\n');

const SHORT_ORNATE_SCENE = `Pell had a voice like a hinge nobody oiled.

The kitchen held its breath.

The silence had a texture. Nobody touched it.

She wrung the dishcloth the way one wrings out a confession.

Her temper had the choreography of her grief.

The universe's idea of a joke arrived on time.`;

const LONG_SENTENCE =
  'She walked the length of the courtyard with the river still in her boots and every unanswered letter from her brother folded in her coat, thinking of the ferry and the fog and the way the lamps had looked from the water before the engine failed.';

function paragraphsOf(sentence: string, count: number): string {
  return Array.from({ length: count }, (_, i) => `Part ${i + 1}. ${sentence}`).join('\n\n');
}

describe('assessReadability', () => {
  it('should measure plain, dialogue-led prose without crossing any limit', () => {
    const evidence = assessReadability(PLAIN_CHAPTER);
    expect(evidence?.overLimits).toEqual([]);
    expect(evidence?.flagged).toEqual([]);
    expect(readabilityNote(evidence ?? null)).toBeNull();
  });

  it('should skip a draft too short for the averages to mean anything', () => {
    expect(assessReadability(paragraphsOf(LONG_SENTENCE, 3))).toBeNull();
    expect(readabilityNote(null)).toBeNull();
  });

  it('should flag long sentences and name the limit they cross', () => {
    const evidence = assessReadability(paragraphsOf(LONG_SENTENCE, 12));
    expect(evidence?.overLimits.some(limit => limit.startsWith('average sentence'))).toBe(true);
    expect(evidence?.flagged[0]).toEqual({ sentence: LONG_SENTENCE, reason: 'over 30 words' });
  });

  it('should note a wall of text against the paragraph limit', () => {
    const wall = Array.from({ length: 6 }, () => Array.from({ length: 18 }, (_, i) => `She counted lamp ${i} and moved on.`).join(' ')).join('\n\n');
    expect(assessReadability(wall)?.overLimits.some(limit => limit.includes(`(limit ${AVERAGE_PARAGRAPH_WORDS_MAX})`))).toBe(true);
  });

  it('should tolerate an occasional ornate phrase and note a habit of them', () => {
    const ornate = 'The silence had a weight to it.';
    const few = `${PLAIN_CHAPTER}\n\n${Array.from({ length: ORNATE_HITS_MIN - 1 }, () => ornate).join('\n\n')}`;
    const many = `${PLAIN_CHAPTER}\n\n${Array.from({ length: ORNATE_HITS_MIN + 1 }, () => ornate).join('\n\n')}`;

    expect(assessReadability(few)?.overLimits).toEqual([]);
    const limit = assessReadability(many)?.overLimits.find(entry => entry.startsWith('ornate constructions'));
    expect(limit).toContain(`(limit ${ORNATE_HITS_PER_1000_WORDS_MAX})`);
  });

  it('should measure ornate phrases as a rate, so the same few spread over a long chapter stay under the limit', () => {
    const ornate = 'The silence had a weight to it.';
    const long = `${Array.from({ length: 4 }, () => PLAIN_CHAPTER).join('\n\n')}\n\n${Array.from({ length: ORNATE_HITS_MIN }, () => ornate).join('\n\n')}`;
    expect(assessReadability(long)?.overLimits).toEqual([]);
  });

  it('should note ornate diction even when every sentence is short', () => {
    const evidence = assessReadability(`${PLAIN_CHAPTER}\n\n${SHORT_ORNATE_SCENE}`);

    expect(evidence?.overLimits).toHaveLength(1);
    expect(evidence?.overLimits[0]).toStartWith('ornate constructions');
    expect(evidence?.flagged).toHaveLength(5);
    expect(evidence?.flagged[0]).toEqual({ sentence: 'Pell had a voice like a hinge nobody oiled.', reason: 'metaphor for a voice' });
  });
});

describe('renderReadabilityEvidence', () => {
  it('should render the measurements, the crossed limits and the numbered flagged sentences', () => {
    const evidence = assessReadability(`${PLAIN_CHAPTER}\n\n${SHORT_ORNATE_SCENE}`);
    if (!evidence) throw new Error('expected evidence');
    const block = renderReadabilityEvidence(evidence);

    expect(block).toStartWith('## READABILITY EVIDENCE\n');
    expect(block).toMatch(
      /\d+ words · average sentence [\d.]+ words · sentences over 30 words \d+% · average paragraph \d+ words · reading grade -?[\d.]+ · ornate constructions 6/,
    );
    expect(block).toContain("Over the default's limits: ornate constructions");
    expect(block).toContain('Flagged sentences:\n1. "Pell had a voice like a hinge nobody oiled." (metaphor for a voice)');
  });

  it('should say when no limit is crossed', () => {
    const evidence = assessReadability(PLAIN_CHAPTER);
    if (!evidence) throw new Error('expected evidence');
    expect(renderReadabilityEvidence(evidence)).toContain("Over the default's limits: none");
  });
});

describe('readabilityNote', () => {
  it('should record the numbers as an info line only when a limit is crossed', () => {
    const note = readabilityNote(assessReadability(`${PLAIN_CHAPTER}\n\n${SHORT_ORNATE_SCENE}`));
    expect(note).toStartWith(`[info] ${READABILITY_PREFIX}measured `);
    expect(note).toContain("over the default's limits: ornate constructions");
  });
});

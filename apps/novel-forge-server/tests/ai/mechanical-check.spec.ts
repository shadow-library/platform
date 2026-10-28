import { describe, expect, it } from 'bun:test';

import {
  checkDraftMechanics,
  DUPLICATE_PARAGRAPH_MIN_WORDS,
  findBoundaryEcho,
  findDuplicatedParagraphs,
  findSimileFrameOveruse,
  WORD_COUNT_HARD_MAX,
  WORD_COUNT_HARD_MIN,
} from '@modules/ai/graphs/mechanical-check';
import { resolveWordTarget, WORD_TARGET_MAX, WORD_TARGET_MIN } from '@modules/eval/deterministic-metrics';

const SENTENCE = 'She climbed the ridge and did not look back. ';
const SENTENCE_WORDS = 9;

function bodyOfWords(words: number): string {
  return SENTENCE.repeat(Math.ceil(words / SENTENCE_WORDS)).trim();
}

// A second, unrelated filler pattern — `bodyOfWords` always repeats the same sentence, so two
// independent calls collide on every n-gram; boundary-echo tests need genuinely distinct filler on
// each side of the seam to isolate what's actually being compared.
const OTHER_SENTENCE = 'The archive settled into its afternoon rhythm around her. ';

function otherBodyOfWords(words: number): string {
  return OTHER_SENTENCE.repeat(Math.ceil(words / SENTENCE_WORDS)).trim();
}

const CLEAN_BODY = bodyOfWords(WORD_TARGET_MIN + 100);

describe('checkDraftMechanics', () => {
  it('should return no findings for a draft inside the target band with no other issues', () => {
    expect(checkDraftMechanics(CLEAN_BODY, [])).toEqual([]);
  });

  it('should report a hard finding when the draft is below the word floor', () => {
    const findings = checkDraftMechanics(bodyOfWords(WORD_COUNT_HARD_MIN - 200), []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('hard');
    expect(findings[0]?.text).toContain('below');
  });

  it('should report a hard finding when the draft is above the word ceiling', () => {
    const findings = checkDraftMechanics(bodyOfWords(WORD_COUNT_HARD_MAX + 200), []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('hard');
    expect(findings[0]?.text).toContain('above');
  });

  it('should report a soft finding when the draft is outside the target band but inside the hard bounds', () => {
    const short = checkDraftMechanics(bodyOfWords(WORD_TARGET_MIN - 200), []);
    expect(short).toHaveLength(1);
    expect(short[0]?.severity).toBe('soft');
    expect(short[0]?.text).toContain('under');

    const long = checkDraftMechanics(bodyOfWords(WORD_TARGET_MAX + 200), []);
    expect(long).toHaveLength(1);
    expect(long[0]?.severity).toBe('soft');
    expect(long[0]?.text).toContain('over');
  });

  it('should check against a project’s overridden word target instead of the application default', () => {
    const target = resolveWordTarget({ wordTargetMin: 2000, wordTargetMax: 3500 });

    const underOverride = checkDraftMechanics(bodyOfWords(1900), [], target);
    expect(underOverride).toHaveLength(1);
    expect(underOverride[0]?.severity).toBe('soft');
    expect(underOverride[0]?.text).toContain('under the 2000–3500 target band');

    expect(checkDraftMechanics(bodyOfWords(3000), [], target)).toEqual([]);

    // 4,000 words: over the override's 3,500 ceiling but under its hard ceiling (3,500 + 600 slack = 4,100) — soft only.
    const overSoftCeiling = checkDraftMechanics(bodyOfWords(4000), [], target);
    expect(overSoftCeiling).toHaveLength(1);
    expect(overSoftCeiling[0]?.severity).toBe('soft');
    expect(overSoftCeiling[0]?.text).toContain('over the 2000–3500 target band');

    // The hard ceiling moves with the override too: 4,200 is well inside the default hard ceiling
    // (3,200) territory, but here it clears the override's own 4,100 hard ceiling.
    const overHardCeiling = checkDraftMechanics(bodyOfWords(4200), [], target);
    expect(overHardCeiling).toHaveLength(1);
    expect(overHardCeiling[0]?.severity).toBe('hard');
    expect(overHardCeiling[0]?.text).toContain('above');
  });

  it('should count prose only, so system panels and tables cannot carry a short draft past the floor', () => {
    const table = `| Item | Count |\n| --- | --- |\n${'| Rope and a long iron hook | 1 |\n'.repeat(400)}`;
    const findings = checkDraftMechanics(`${bodyOfWords(WORD_COUNT_HARD_MIN - 200)}\n\n\`\`\`system Inventory\n${table}\`\`\`\n\n${table}`, []);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('hard');
    expect(findings[0]?.text).toContain('words of prose, below');
  });

  it('should report a hard finding when a fence is never closed', () => {
    const findings = checkDraftMechanics(`${CLEAN_BODY}\n\n\`\`\`system Quest\nFind the well.`, []);
    expect(findings).toEqual([{ severity: 'hard', text: 'mechanical: the fence opened by "```system Quest" is never closed, so the rest of the chapter renders inside it' }]);
  });

  it('should not count a stat table repeated from the prior chapters as recycled phrasing', () => {
    const sheet = `\`\`\`system Status\n| Attribute | Value |\n| --- | --- |\n${'| Strength of the left arm | 14 |\n'.repeat(40)}\`\`\``;
    const findings = checkDraftMechanics(`${sheet}\n\n${CLEAN_BODY}`, [`${otherBodyOfWords(WORD_TARGET_MIN)}\n\n${sheet}`]);
    expect(findings).toEqual([]);
  });

  it('should report a hard finding when a paragraph is repeated verbatim', () => {
    const paragraph = bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10);
    const findings = checkDraftMechanics(`${CLEAN_BODY}\n\n${paragraph}\n\n${paragraph}`, []);
    expect(findings.filter(f => f.severity === 'hard')).toHaveLength(1);
    expect(findings[0]?.text).toContain('repeated verbatim');
  });

  it('should report a soft finding when too many phrases repeat from the prior chapters', () => {
    const shared = bodyOfWords(400);
    const findings = checkDraftMechanics(`${shared} ${bodyOfWords(1500).replace(/ridge/g, 'harbour')}`, [shared]);
    const ngramFinding = findings.find(f => f.text.includes('also appear in the previous'));
    expect(ngramFinding?.severity).toBe('soft');
  });

  it('should not compare against prior chapters when none are supplied', () => {
    expect(checkDraftMechanics(CLEAN_BODY, []).some(f => f.text.includes('also appear in the previous'))).toBe(false);
  });

  it('should report a soft finding when the draft leans on stock phrases', () => {
    const cliches = 'Her eyes narrowed. His jaw tightened. Her breath hitched. His eyes widened. Her stomach dropped. His blood ran cold. She raised an eyebrow. ';
    const findings = checkDraftMechanics(`${CLEAN_BODY} ${cliches}`, []);
    const stockFinding = findings.find(f => f.text.includes('stock phrases'));
    expect(stockFinding?.severity).toBe('soft');
  });

  it('should report a soft finding when dialogue tags crowd the prose', () => {
    const chatter = '"Run," Mara shouted. "Now," Elin growled. "Wait," Mara hissed. "Why," Elin demanded. "Go," Mara whispered. '.repeat(12);
    const findings = checkDraftMechanics(`${bodyOfWords(WORD_TARGET_MIN)} ${chatter}`, []);
    expect(findings.find(f => f.text.includes('dialogue tags per 1,000 words'))?.severity).toBe('soft');
    expect(findings.find(f => f.text.includes('avoid "said"'))?.severity).toBe('soft');
  });

  it('should never emit a hard finding for a purely stylistic problem', () => {
    const cliches = 'Her eyes narrowed. His jaw tightened. Her breath hitched. His eyes widened. Her stomach dropped. His blood ran cold. She raised an eyebrow. ';
    expect(checkDraftMechanics(`${CLEAN_BODY} ${cliches}`, []).every(f => f.severity === 'soft')).toBe(true);
  });

  it("should report a hard finding when the chapter opens by repeating the previous chapter's ending verbatim", () => {
    const closingLine = 'Mira stopped because walking around him would have been an answer to a question no one had asked aloud.';
    const prevBody = `${bodyOfWords(WORD_TARGET_MIN)} ${closingLine}`;
    const body = `${closingLine} ${otherBodyOfWords(WORD_TARGET_MIN)}`;
    const findings = checkDraftMechanics(body, [prevBody]);
    const echoFinding = findings.find(f => f.text.includes("repeating the previous chapter's ending"));
    expect(echoFinding?.severity).toBe('hard');
  });

  it('should not flag a clean continuation that merely shares a name or a stock verb with the prior ending', () => {
    const prevBody = `${bodyOfWords(WORD_TARGET_MIN)} Mira stopped at the door and listened.`;
    const body = `Mira crossed the square without looking back. ${otherBodyOfWords(WORD_TARGET_MIN)}`;
    const findings = checkDraftMechanics(body, [prevBody]);
    expect(findings.some(f => f.text.includes("repeating the previous chapter's ending"))).toBe(false);
  });
});

const LEANING_ON_LIKE_A = [
  'Rain hit the shutters like a fistful of gravel.',
  'The lamp swung like a hanged man in the draught.',
  'Ilka moved through the market like a knife through cloth.',
  'Her coat hung on her like a borrowed flag.',
  'The bells started up like a quarrel in the next street.',
  'Smoke sat over the roofs like a lid on a pot.',
  'The guard watched her like a dog watches a door.',
  'The letter lay in her pocket like a stone.',
].join(' ');

const LITERARY_PARAGRAPH = [
  'Ilka reached the ferry before the bell. The river was high and brown, carrying branches down from the hills, and the ferryman stood in the stern with his pole',
  'across his knees. He held out his hand the way a man does when he expects to be cheated. She paid him in copper and sat on the bench by the rail.',
  'Halfway across, the boat lurched. Water slapped over the side and soaked her boots. The ferryman swore, leaned on the pole and brought the bow round. On the far',
  'bank a woman in a grey shawl was waiting with a basket of eggs, the kind of patience that came from long practice. Ilka climbed out, nodded to her and started up',
  'the path. The mill wheel turned like a slow clock. Behind her the ferryman was already pushing off.',
].join(' ');

describe('findSimileFrameOveruse', () => {
  it('should name a frame the narration leans on, with its count and rate', () => {
    expect(findSimileFrameOveruse(`${bodyOfWords(1000)}\n\n${LEANING_ON_LIKE_A}`)).toEqual([{ label: 'like a', count: 8, per1000Words: expect.closeTo(7.4, 1) }]);
  });

  it('should leave a literary paragraph with one of each frame alone', () => {
    expect(findSimileFrameOveruse(LITERARY_PARAGRAPH)).toEqual([]);
    expect(findSimileFrameOveruse(`${bodyOfWords(WORD_TARGET_MIN)}\n\n${LITERARY_PARAGRAPH}\n\n${LITERARY_PARAGRAPH.replace('Ilka', 'Mara')}`)).toEqual([]);
  });

  it('should not flag a chapter-length draft whose similes are spread at a normal rate', () => {
    expect(findSimileFrameOveruse(`${bodyOfWords(4000)}\n\n${LEANING_ON_LIKE_A}`)).toEqual([]);
  });

  it('should count narration only, never dialogue or a wish', () => {
    const talk = Array.from({ length: 8 }, (_, i) => `"I'd like a drink," Mara said. “It looked like a trap,” Elin said. She would like a bath before supper ${i}.`).join('\n\n');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${talk}`)).toEqual([]);
  });

  it('should treat single-quoted speech as dialogue, but not the apostrophes inside or around it', () => {
    const speech = Array.from({ length: 8 }, () => '‘It won’t hold like a proper wall,’ Mara said. ‘We’d need the kind of stone they don’t sell here.’').join('\n\n');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${speech}`)).toEqual([]);
    const narration = Array.from({ length: 8 }, () => 'The guards’ boots rang like a bell on the stones, and Mara’s lamp swung.').join(' ');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${narration}`).map(frame => [frame.label, frame.count])).toEqual([['like a', 8]]);
  });

  it('should treat a quotation left open across paragraphs as dialogue', () => {
    const speech = Array.from({ length: 8 }, () => '“It came down like a wall of water, and the sea ran like a river through the town.').join('\n\n');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${speech}”`)).toEqual([]);
  });

  it('should report each overused frame on its own', () => {
    const frames = Array.from({ length: 6 }, () => 'She folded the map the way a clerk folds a verdict. It was the kind of quiet that waits.').join(' ');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${frames}`).map(frame => [frame.label, frame.count])).toEqual([
      ['the way a', 6],
      ['the kind of', 6],
    ]);
  });

  it('should not read a journey as a simile', () => {
    const journeys = Array.from({ length: 8 }, () => 'On the way a cart passed them, and by the way someone waved they knew the road was clear.').join(' ');
    expect(findSimileFrameOveruse(`${bodyOfWords(600)}\n\n${journeys}`)).toEqual([]);
  });
});

describe('checkDraftMechanics simile frames', () => {
  it('should raise a soft finding naming the frame and its count so repair can vary it', () => {
    const findings = checkDraftMechanics(`${CLEAN_BODY}\n\n${LEANING_ON_LIKE_A}`, []);
    expect(findings).toEqual([{ severity: 'soft', text: expect.stringContaining('mechanical: the comparison frame "like a…" appears 8 times') }]);
  });

  it('should not count similes inside a system panel', () => {
    const panel = `\`\`\`system Notice\n${LEANING_ON_LIKE_A}\n\`\`\``;
    expect(checkDraftMechanics(`${CLEAN_BODY}\n\n${panel}`, [])).toEqual([]);
  });
});

describe('findBoundaryEcho', () => {
  it('should return null when there is no prior chapter', () => {
    expect(findBoundaryEcho('Mira stopped.', undefined)).toBeNull();
  });

  it('should return null when the opening and closing share no run of words', () => {
    expect(findBoundaryEcho(otherBodyOfWords(80), bodyOfWords(80))).toBeNull();
  });

  it('should return the shared run when the opening repeats the closing verbatim', () => {
    const line = 'Mira stopped because walking around him would have been an answer.';
    const echo = findBoundaryEcho(`${line} ${otherBodyOfWords(80)}`, `${bodyOfWords(80)} ${line}`);
    expect(echo).not.toBeNull();
  });

  it('should ignore a shared run outside the boundary window', () => {
    const line = 'Mira stopped because walking around him would have been an answer.';
    // Four hand-written, topically unrelated fillers — none shares a run of six consecutive words with
    // any other, so the only way this test can find an echo is by looking outside the boundary window
    // where it shouldn't. A repeated-sentence filler would make any two of its windows match each
    // other regardless of position, which would defeat the point of this test.
    const bodyOpeningFiller =
      'The customs clerk stacked the crates by weight and origin, marking each one against the harbor manifest before the tide turned and the loading crews returned to finish the count before dark fell over the quay and the last lanterns were lit along the warehouse row, one by one, while the tally sheets were gathered and locked away for the night in the strongbox by the door.';
    const bodyClosingFiller =
      'Rain kept falling on the warehouse roof long after the last cart left, and the night watchman lit his lantern early because the storm clouds had swallowed what little dusk light remained, leaving the yard dark enough that he had to count the barrels twice by feel alone before he trusted the number scrawled on his slate and finally allowed himself to head home for the night.';
    const prevOpeningFiller =
      'Somewhere past the third pier a bell rang for the evening shift change, and the fishmongers began folding their stalls while gulls circled low over the abandoned catch baskets nearby, screeching at the last scraps until a boy with a broom chased them off toward the seawall, where they settled again in a restless line along the stone and waited for the market to empty out.';
    const prevClosingFiller =
      'A courier on horseback pushed through the market crowd carrying sealed letters for the council chambers, ignoring the shouted complaints of vendors whose carts he nearly overturned along the way, and by the time he reached the gate the guards had already changed shift twice, so he had to explain his errand all over again before anyone would let him through with the pouch.';
    // The shared line sits deep inside both bodies, buffered on each side, so it never enters either
    // 60-word boundary window — the actual seam text (opening vs. closing filler) differs.
    const body = `${bodyOpeningFiller} ${line} ${bodyClosingFiller}`;
    const prevBody = `${prevOpeningFiller} ${line} ${prevClosingFiller}`;
    expect(findBoundaryEcho(body, prevBody)).toBeNull();
  });
});

describe('findDuplicatedParagraphs', () => {
  it('should ignore paragraphs shorter than the minimum word count', () => {
    const short = 'He waited.';
    expect(findDuplicatedParagraphs(`${short}\n\n${short}`)).toEqual([]);
  });

  it('should not flag two long paragraphs that merely start alike', () => {
    const first = `${bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10)} The gate held.`;
    const second = `${bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10)} The gate gave way.`;
    expect(findDuplicatedParagraphs(`${first}\n\n${second}`)).toEqual([]);
  });

  it('should treat whitespace-only differences as the same paragraph', () => {
    const paragraph = bodyOfWords(DUPLICATE_PARAGRAPH_MIN_WORDS + 10);
    expect(findDuplicatedParagraphs(`${paragraph}\n\n${paragraph.replace(/ /g, '  ')}`)).toHaveLength(1);
  });
});

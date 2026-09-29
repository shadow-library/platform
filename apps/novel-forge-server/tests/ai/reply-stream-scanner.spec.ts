import { describe, expect, it } from 'bun:test';

import { ReplyStreamScanner } from '@modules/ai/reply-stream-scanner';

const RAW_PAYLOAD =
  '{"changeSet":[{"op":"upsert","target":"bible:x","value":{"reply":"not me","note":"contains { and [ and \\"reply\\" text"}}],' +
  '"lookups":[{"tool":"search_lore","args":{"q":"a}b]c","n":42,"ok":true,"none":null}}],' +
  '"reply":"Hello \\"world\\"!\\nLine two\\twith tab, caf\\u00e9 \\ud83d\\ude00 and \\\\backslash\\\\ end."}';

const EXPECTED_REPLY = (JSON.parse(RAW_PAYLOAD) as { reply: string }).reply;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function feed(text: string, chunkSizes: number[]): { output: string; found: boolean } {
  const scanner = new ReplyStreamScanner();
  let output = '';
  let offset = 0;
  for (const size of chunkSizes) {
    if (offset >= text.length) break;
    output += scanner.push(text.slice(offset, offset + size));
    offset += size;
  }
  if (offset < text.length) output += scanner.push(text.slice(offset));
  return { output, found: scanner.replyFound };
}

function randomSplitSizes(length: number, rand: () => number): number[] {
  const sizes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    const size = Math.max(1, Math.floor(rand() * 5));
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

describe('ReplyStreamScanner', () => {
  it('should emit the whole reply when pushed as a single chunk', () => {
    const scanner = new ReplyStreamScanner();
    expect(scanner.push(RAW_PAYLOAD)).toBe(EXPECTED_REPLY);
    expect(scanner.replyFound).toBe(true);
  });

  it('should not emit text from a "reply" key nested inside changeSet', () => {
    const { output } = feed(RAW_PAYLOAD, [RAW_PAYLOAD.length]);
    expect(output).not.toContain('not me');
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should skip strings containing braces, brackets, escaped quotes, and the literal text "reply"', () => {
    const { output, found } = feed(RAW_PAYLOAD, [RAW_PAYLOAD.length]);
    expect(found).toBe(true);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should decode \\n, \\t, \\", \\\\, and \\u escapes, including a surrogate pair', () => {
    expect(EXPECTED_REPLY).toContain('\n');
    expect(EXPECTED_REPLY).toContain('\t');
    expect(EXPECTED_REPLY).toContain('"world"');
    expect(EXPECTED_REPLY).toContain('café');
    expect(EXPECTED_REPLY).toContain('😀');
    expect(EXPECTED_REPLY).toContain('\\backslash\\');
  });

  it('should decode \\/, \\b, and \\f', () => {
    const scanner = new ReplyStreamScanner();
    const payload = String.raw`{"reply":"a\/b\bc\fd"}`;
    expect(scanner.push(payload)).toBe('a/b\bc\fd');
  });

  it('should report replyFound false when the reply key never arrives', () => {
    const scanner = new ReplyStreamScanner();
    const payload = '{"changeSet":[{"op":"upsert","target":"bible:x","value":{"body":"no reply here"}}]}';
    const output = scanner.push(payload);
    expect(output).toBe('');
    expect(scanner.replyFound).toBe(false);
  });

  it('should tolerate a markdown fence and leading prose before the JSON object', () => {
    const fenced = 'Sure, here you go:\n```json\n' + RAW_PAYLOAD + '\n```';
    const scanner = new ReplyStreamScanner();
    expect(scanner.push(fenced)).toBe(EXPECTED_REPLY);
    expect(scanner.replyFound).toBe(true);
  });

  it('should stop emitting after the closing unescaped quote of the reply value', () => {
    const trailing = RAW_PAYLOAD + '\n\nignored trailer text {not json} "reply": "fake"';
    const scanner = new ReplyStreamScanner();
    expect(scanner.push(trailing)).toBe(EXPECTED_REPLY);
  });

  it('should emit only what was decoded before a stream truncated mid-value, without throwing', () => {
    const cut = RAW_PAYLOAD.slice(0, RAW_PAYLOAD.indexOf('\\u00e9'));
    const scanner = new ReplyStreamScanner();
    const output = scanner.push(cut);
    expect(() => scanner.push('more text that never closes the string')).not.toThrow();
    expect(EXPECTED_REPLY.startsWith(output)).toBe(true);
    expect(scanner.replyFound).toBe(true);
  });

  it('should report replyFound false when truncated before the reply key is ever reached', () => {
    const cut = RAW_PAYLOAD.slice(0, RAW_PAYLOAD.indexOf('"lookups"'));
    const scanner = new ReplyStreamScanner();
    scanner.push(cut);
    expect(scanner.replyFound).toBe(false);
  });

  it('should split a key across a chunk boundary mid-key ("re" + "ply":)', () => {
    const { output } = feed(RAW_PAYLOAD, [RAW_PAYLOAD.indexOf('"reply"') + '"re'.length]);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should split at a boundary between the key and the colon', () => {
    const idx = RAW_PAYLOAD.lastIndexOf('"reply"') + '"reply"'.length;
    const { output } = feed(RAW_PAYLOAD, [idx]);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should split inside an escape sequence ("\\\\" then "n")', () => {
    const idx = RAW_PAYLOAD.indexOf('\\nLine') + 1;
    const { output } = feed(RAW_PAYLOAD, [idx]);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should split a \\u escape into one character per chunk (up to 6 chunks)', () => {
    const idx = RAW_PAYLOAD.indexOf('\\u00e9');
    const chunkSizes = [idx, 1, 1, 1, 1, 1, 1];
    const { output } = feed(RAW_PAYLOAD, chunkSizes);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should split a surrogate-pair escape (\\ud83d\\ude00) across separate pushes', () => {
    const idx = RAW_PAYLOAD.indexOf('\\ud83d');
    const { output } = feed(RAW_PAYLOAD, [idx, 6, RAW_PAYLOAD.length]);
    expect(output).toBe(EXPECTED_REPLY);
  });

  it('should produce identical output when the whole payload is fed one character at a time', () => {
    const chunkSizes = Array.from({ length: RAW_PAYLOAD.length }, () => 1);
    const { output, found } = feed(RAW_PAYLOAD, chunkSizes);
    expect(output).toBe(EXPECTED_REPLY);
    expect(found).toBe(true);
  });

  it('should produce identical output for every two-chunk split of the payload (one boundary at every position)', () => {
    for (let splitAt = 0; splitAt <= RAW_PAYLOAD.length; splitAt++) {
      const { output, found } = feed(RAW_PAYLOAD, [splitAt, RAW_PAYLOAD.length - splitAt]);
      expect(output).toBe(EXPECTED_REPLY);
      expect(found).toBe(true);
    }
  });

  it('should produce identical output for 30 randomized chunkings of the same payload (seeded)', () => {
    const rand = mulberry32(1234567);
    for (let trial = 0; trial < 30; trial++) {
      const sizes = randomSplitSizes(RAW_PAYLOAD.length, rand);
      const { output, found } = feed(RAW_PAYLOAD, sizes);
      expect(output).toBe(EXPECTED_REPLY);
      expect(found).toBe(true);
    }
  });

  it('should resync after a brace inside leading prose instead of dying silently', () => {
    const noisy = 'Here is the JSON {as requested}:\n{"reply":"hi"}';
    const scanner = new ReplyStreamScanner();
    expect(scanner.push(noisy)).toBe('hi');
    expect(scanner.replyFound).toBe(true);
  });

  it('should resync across chunk boundaries when the brace-bearing prose is split mid-chunk', () => {
    const noisy = 'Here is the JSON {as requested}:\n{"reply":"hi"}';
    const { output, found } = feed(noisy, [18, 1, 1, 1, 1, 1, 1, 1, noisy.length]);
    expect(output).toBe('hi');
    expect(found).toBe(true);
  });

  it('should never mistake a very long unterminated key for "reply", nor buffer it unbounded', () => {
    const scanner = new ReplyStreamScanner();
    scanner.push('{"');
    const start = performance.now();
    scanner.push('x'.repeat(100_000));
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(200);
    expect(scanner.push('":"value","reply":"hi"}')).toBe('hi');
    expect(scanner.replyFound).toBe(true);
  });

  it('should not treat a key merely starting with the same letters as "reply"', () => {
    const scanner = new ReplyStreamScanner();
    expect(scanner.push('{"replying":"not the field","reply":"the field"}')).toBe('the field');
  });

  it('should return only well-formed UTF-16 from every push, even when a surrogate pair is split', () => {
    const payload = '{"reply":"hi 😀!"}';
    const scanner = new ReplyStreamScanner();
    let output = '';
    for (const char of payload) {
      const delta = scanner.push(char);
      const first = delta.charCodeAt(0);
      expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
      const last = delta.charCodeAt(delta.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      output += delta;
    }
    expect(output).toBe('hi 😀!');
  });

  it('should not leak a top-level reply value that turns out to be an array instead of a string', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":["leak"],"x":1}');
    expect(output).toBe('');
    expect(scanner.replyFound).toBe(false);
  });

  it('should not leak a top-level reply value that turns out to be an object', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":{"reply":"leak"},"x":1}');
    expect(output).toBe('');
    expect(scanner.replyFound).toBe(false);
  });

  it('should not leak a top-level reply value that turns out to be a scalar', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":true,"x":1}');
    expect(output).toBe('');
    expect(scanner.replyFound).toBe(false);
  });

  it('should still find a later, correctly-typed reply after an earlier mistyped one', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"changeSet":[{"reply":123}],"reply":"hi"}');
    expect(output).toBe('hi');
    expect(scanner.replyFound).toBe(true);
  });

  it('should abandon a truncated \\u escape and re-dispatch the terminating quote as the string end', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":"a\\u12","after":"LEAK"}');
    expect(output).toBe('a');
    expect(scanner.replyFound).toBe(true);
  });

  it('should abandon a truncated \\u escape and re-dispatch a following backslash as a new escape', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":"a\\u12\\nb"}');
    expect(output).toBe('a\nb');
  });

  it('should decode uppercase and mixed-case \\u hex digits', () => {
    const scanner = new ReplyStreamScanner();
    expect(scanner.push('{"reply":"\\u00E9\\u00e9\\u00E9"}')).toBe('ééé');
  });

  it('should decode \\u0000', () => {
    const scanner = new ReplyStreamScanner();
    expect(scanner.push('{"reply":"a\\u0000b"}')).toBe('a\0b');
  });

  it('should handle an empty reply string', () => {
    const scanner = new ReplyStreamScanner();
    expect(scanner.push('{"reply":""}')).toBe('');
    expect(scanner.replyFound).toBe(true);
  });

  it('should emit correctly when reply is the first key', () => {
    const scanner = new ReplyStreamScanner();
    const output = scanner.push('{"reply":"first","changeSet":[]}');
    expect(output).toBe('first');
    expect(scanner.replyFound).toBe(true);
  });

  it('should handle pretty-printed JSON with whitespace and newlines between tokens', () => {
    const pretty = ['{', '  "changeSet": [],', '  "reply": "hello there"', '}'].join('\n');
    const scanner = new ReplyStreamScanner();
    expect(scanner.push(pretty)).toBe('hello there');
    expect(scanner.replyFound).toBe(true);
  });
});

const CHANGE_ELEMENTS = [
  { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara "the Quiet"', body: 'Braces { and } and brackets [ ] and a \\ backslash' },
  { op: 'bible_document.upsert', section: 'world', slug: 'tides', frontmatter: { title: 'Tides', tags: ['sea', { nested: [1, 2, { deep: '}]' }] }] } },
  { op: 'promise.create', kind: 'mystery', key: 'who-rang', label: 'Who rang the bell? — café 😀', openedChapter: 3, done: null, flag: true },
];

const CHANGES_AFTER_REPLY = JSON.stringify({ reply: 'Here are the changes.', changeSet: CHANGE_ELEMENTS, question: 'Anything else?' });
const CHANGES_BEFORE_REPLY = JSON.stringify({ changeSet: CHANGE_ELEMENTS, lookups: [], reply: 'Changes first.' });

function feedChanges(text: string, chunkSizes: number[]): { reply: string; elements: unknown[]; afterEachPush: number[] } {
  const scanner = new ReplyStreamScanner();
  const elements: unknown[] = [];
  const afterEachPush: number[] = [];
  let reply = '';
  let offset = 0;
  for (const size of [...chunkSizes, text.length]) {
    if (offset >= text.length) break;
    reply += scanner.push(text.slice(offset, offset + size));
    offset += size;
    elements.push(...scanner.takeChangeSetElements());
    afterEachPush.push(elements.length);
  }
  return { reply, elements, afterEachPush };
}

describe('ReplyStreamScanner changeSet elements', () => {
  it('should hand over every changeSet element after the reply, parsed exactly', () => {
    const { reply, elements } = feedChanges(CHANGES_AFTER_REPLY, [CHANGES_AFTER_REPLY.length]);
    expect(reply).toBe('Here are the changes.');
    expect(elements).toEqual(CHANGE_ELEMENTS);
  });

  it('should hand over every changeSet element that precedes the reply', () => {
    const { reply, elements } = feedChanges(CHANGES_BEFORE_REPLY, [CHANGES_BEFORE_REPLY.length]);
    expect(reply).toBe('Changes first.');
    expect(elements).toEqual(CHANGE_ELEMENTS);
  });

  it.each([
    ['after', CHANGES_AFTER_REPLY],
    ['before', CHANGES_BEFORE_REPLY],
  ])('should produce the same elements for every two-chunk split with changeSet %s the reply, including inside strings, escapes and nested containers', (_, payload) => {
    for (let splitAt = 0; splitAt <= payload.length; splitAt++) expect(feedChanges(payload, [splitAt]).elements).toEqual(CHANGE_ELEMENTS);
  });

  it('should produce the same elements when fed one character at a time', () => {
    const { reply, elements } = feedChanges(
      CHANGES_AFTER_REPLY,
      Array.from({ length: CHANGES_AFTER_REPLY.length }, () => 1),
    );
    expect(reply).toBe('Here are the changes.');
    expect(elements).toEqual(CHANGE_ELEMENTS);
  });

  it('should release an element as soon as its closing brace arrives, before the array closes', () => {
    const firstEnd = CHANGES_AFTER_REPLY.indexOf(JSON.stringify(CHANGE_ELEMENTS[0])) + JSON.stringify(CHANGE_ELEMENTS[0]).length;
    const scanner = new ReplyStreamScanner();
    scanner.push(CHANGES_AFTER_REPLY.slice(0, firstEnd - 1));
    expect(scanner.takeChangeSetElements()).toEqual([]);
    scanner.push(CHANGES_AFTER_REPLY.slice(firstEnd - 1, firstEnd));
    expect(scanner.takeChangeSetElements()).toEqual([CHANGE_ELEMENTS[0]]);
    expect(scanner.takeChangeSetElements()).toEqual([]);
  });

  it('should hand over nothing when the payload has no changeSet', () => {
    const { reply, elements } = feedChanges('{"reply":"Just talking.","question":"Why?"}', [5]);
    expect(reply).toBe('Just talking.');
    expect(elements).toEqual([]);
  });

  it('should hand over nothing for an empty changeSet', () => {
    expect(feedChanges('{"reply":"x","changeSet":[]}', [3]).elements).toEqual([]);
  });

  it('should skip elements that do not parse, are not objects, or lack a string op, and keep the rest', () => {
    const payload = '{"reply":"x","changeSet":[{"op":"a",},"text",42,["op"],{"op":7},{"kind":"thread"},{"op":undefined},{"op":"premise.update"},null]}';
    expect(feedChanges(payload, [payload.length]).elements).toEqual([{ op: 'premise.update' }]);
  });

  it('should ignore a changeSet key that is not top-level', () => {
    const payload = '{"reply":"x","lookups":[{"tool":"t","args":{"changeSet":[{"op":"hidden"}]}}]}';
    expect(feedChanges(payload, [payload.length]).elements).toEqual([]);
  });

  it('should never hand over an element the stream cut off before its closing brace', () => {
    const cut = CHANGES_AFTER_REPLY.slice(0, CHANGES_AFTER_REPLY.indexOf('"promise.create"'));
    expect(feedChanges(cut, [cut.length]).elements).toEqual(CHANGE_ELEMENTS.slice(0, 2));
  });

  it('should stream only the first top-level reply when the key repeats', () => {
    expect(feedChanges('{"reply":"first","changeSet":[{"op":"a"}],"reply":"second"}', [4]).reply).toBe('first');
  });

  it('should skip an element that closes as invalid JSON and still hand over the ones after it', () => {
    const payload = '{"reply":"x","changeSet":[{"op":"lost" oops},{"op":"kept","note":"a\\"}b"}]}';
    expect(feedChanges(payload, [7]).elements).toEqual([{ op: 'kept', note: 'a"}b' }]);
  });

  it('should ignore everything after the top-level object closes', () => {
    const trailing = '{"reply":"x","changeSet":[{"op":"a"}]}\n{"reply":"y","changeSet":[{"op":"b"}]}';
    const { reply, elements } = feedChanges(trailing, [trailing.length]);
    expect(reply).toBe('x');
    expect(elements).toEqual([{ op: 'a' }]);
  });

  it('should handle pretty-printed changeSet elements', () => {
    const pretty = JSON.stringify({ reply: 'x', changeSet: CHANGE_ELEMENTS }, null, 2);
    expect(feedChanges(pretty, [11]).elements).toEqual(CHANGE_ELEMENTS);
  });
});

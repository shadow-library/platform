import { afterEach, describe, expect, it } from 'bun:test';

import { ApiError } from '../src/lib/apis/transport';
import { queuePendingFirstTurn, takePendingFirstTurn } from '../src/lib/pending-first-turn';
import {
  BLANK_OPENER,
  completeStart,
  countNoteWords,
  firstTurnFor,
  isStartBlocked,
  isSubmitShortcut,
  NOTES_MAX_CHARS,
  NOTES_MAX_WORDS,
  NOTES_OPENER,
  NOTES_OVER_CHARS,
  NOTES_OVER_WORDS,
  notesCharError,
  notesWordLabel,
  startErrorsFrom,
  titleError,
  titleToSubmit,
  UNTITLED_NOVEL,
} from '../src/lib/start-novel';

const words = (count: number): string => Array.from({ length: count }, () => 'tide').join(' ');

/** The server's rule, copied from novel-forge-server `eval/deterministic-metrics.ts` `countWords`, to hold the two in parity. */
function serverCountWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function apiError(code: string, message = 'Rejected', fields?: { field: string; msg: string }[]): ApiError {
  return new ApiError(400, { code, type: 'CLIENT_ERROR', message, fields });
}

describe('countNoteWords', () => {
  const cases: [string, string, number][] = [
    ['plain prose', '  The sea\n\nrefuses a payment.  ', 5],
    ['CJK with no spaces', '灯台守の弟子は海に払わなかった', 1],
    ['CJK separated by an ideographic space', '灯台　守', 2],
    ['a no-break space', 'Low Harrow', 2],
    ['tabs and newlines', 'one\ttwo\nthree\r\nfour', 4],
    ['a lone em-dash', '—', 1],
    ['an em-dash between spaces', 'tide — ledger', 3],
    ['blank notes', '   \n ', 0],
  ];

  for (const [name, text, expected] of cases) {
    it(`should count ${name} the way the server does`, () => {
      expect(countNoteWords(text)).toBe(expected);
      expect(countNoteWords(text)).toBe(serverCountWords(text));
    });
  }
});

describe('notesWordLabel', () => {
  it('should state the limit while the notes are empty', () => {
    expect(notesWordLabel(0)).toBe('Up to 10,000 words');
  });

  it('should show the count and what is left', () => {
    expect(notesWordLabel(2140)).toBe('2,140 words · 7,860 left');
    expect(notesWordLabel(1)).toBe('1 word · 9,999 left');
  });

  it('should show how far over the limit the notes are', () => {
    expect(notesWordLabel(12_000)).toBe('12,000 words · 2,000 over');
  });
});

describe('isStartBlocked', () => {
  it('should allow a blank title, since the name is optional', () => {
    expect(isStartBlocked('   ', '', 0)).toBe(false);
  });

  it('should allow notes at exactly the word limit', () => {
    const notes = words(NOTES_MAX_WORDS);
    expect(isStartBlocked('T', notes, countNoteWords(notes))).toBe(false);
  });

  it('should block notes one word over the limit', () => {
    const notes = words(NOTES_MAX_WORDS + 1);
    expect(isStartBlocked('T', notes, countNoteWords(notes))).toBe(true);
  });

  it('should block notes over the character limit even when the word count is fine', () => {
    const notes = 'x'.repeat(NOTES_MAX_CHARS + 1);
    expect(isStartBlocked('T', notes, countNoteWords(notes))).toBe(true);
  });

  it('should block a title over 255 characters', () => {
    expect(titleError('x'.repeat(256))).toBe('Keep the title to 255 characters');
    expect(isStartBlocked('x'.repeat(256), '', 0)).toBe(true);
  });
});

describe('notesCharError', () => {
  it('should measure the trimmed notes the web actually sends', () => {
    expect(notesCharError(` ${'x'.repeat(NOTES_MAX_CHARS)} `)).toBeUndefined();
    expect(notesCharError('x'.repeat(NOTES_MAX_CHARS + 1))).toBe(NOTES_OVER_CHARS);
  });
});

describe('titleToSubmit', () => {
  it('should send a blank title as the placeholder the server accepts', () => {
    expect(titleToSubmit('  ')).toBe(UNTITLED_NOVEL);
    expect(UNTITLED_NOVEL).toBe('Untitled novel');
  });

  it('should send a given title trimmed', () => {
    expect(titleToSubmit('  The Tide Ledger ')).toBe('The Tide Ledger');
  });
});

describe('startErrorsFrom', () => {
  it('should put a blank-title rejection on the title', () => {
    expect(startErrorsFrom(apiError('PRJ_014')).title).toContain('Untitled novel');
  });

  it('should put a word-limit rejection on the notes in the same static words as the live check', () => {
    expect(startErrorsFrom(apiError('PRJ_012'))).toEqual({ notes: NOTES_OVER_WORDS });
  });

  it('should keep the project cap on the form, in the server’s words', () => {
    const cap = new ApiError(409, { code: 'PRJ_004', type: 'CONFLICT', message: 'Project limit reached for this account' });
    expect(startErrorsFrom(cap)).toEqual({ form: 'Project limit reached for this account' });
  });

  it('should map schema field errors onto their fields', () => {
    const error = apiError('S003', 'Invalid', [{ field: 'body.notes', msg: 'must NOT have more than 100000 characters' }]);
    expect(startErrorsFrom(error)).toEqual({ notes: 'must NOT have more than 100000 characters' });
  });

  it('should explain a failure that never reached the server without repeating the alert’s title', () => {
    expect(startErrorsFrom(new TypeError('Failed to fetch'))).toEqual({ form: 'Check your connection and try again.' });
  });
});

describe('firstTurnFor', () => {
  it('should hand notes to the chat to organise', () => {
    expect(firstTurnFor('Tamsin keeps the lamp.')).toBe(NOTES_OPENER);
  });

  it('should open a blank start with a question-led design', () => {
    expect(firstTurnFor('  ')).toBe(BLANK_OPENER);
  });
});

describe('isSubmitShortcut', () => {
  it('should submit on ⌘+Enter or Ctrl+Enter', () => {
    expect(isSubmitShortcut({ key: 'Enter', metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSubmitShortcut({ key: 'Enter', metaKey: false, ctrlKey: true })).toBe(true);
  });

  it('should keep a plain Enter as a newline in the notes', () => {
    expect(isSubmitShortcut({ key: 'Enter', metaKey: false, ctrlKey: false })).toBe(false);
  });

  it('should not submit while an input method is composing', () => {
    expect(isSubmitShortcut({ key: 'Enter', metaKey: true, ctrlKey: false, isComposing: true })).toBe(false);
  });

  it('should not submit on the composition keyCode Safari sends without isComposing', () => {
    expect(isSubmitShortcut({ key: 'Enter', metaKey: true, ctrlKey: false, keyCode: 229 })).toBe(false);
  });
});

describe('completeStart', () => {
  it('should queue the opener, then close, then open the new novel’s chat on its session', () => {
    const calls: unknown[] = [];
    completeStart({ projectId: '42', sessionId: 'f3a1' }, 'My notes', {
      queue: (sessionId, content) => calls.push(['queue', sessionId, content]),
      close: () => calls.push(['close']),
      navigate: target => calls.push(['navigate', target]),
    });
    expect(calls).toEqual([['queue', 'f3a1', NOTES_OPENER], ['close'], ['navigate', { to: '/novels/$novelId/chat', params: { novelId: '42' }, search: { session: 'f3a1' } }]]);
  });
});

describe('pending first turn', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  function fakeStorage(): Map<string, string> {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
    return items;
  }

  it('should keep the opener in session storage until the chat takes it, then delete it', () => {
    const items = fakeStorage();
    queuePendingFirstTurn('s1', 'Hello');
    expect([...items.values()]).toEqual(['Hello']);
    expect(takePendingFirstTurn('s2')).toBeUndefined();
    expect(takePendingFirstTurn('s1')).toBe('Hello');
    expect(items.size).toBe(0);
    expect(takePendingFirstTurn('s1')).toBeUndefined();
  });

  it('should fall back to memory when session storage throws', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      get: () => {
        throw new Error('blocked');
      },
      configurable: true,
    });
    queuePendingFirstTurn('s3', 'Hi');
    expect(takePendingFirstTurn('s3')).toBe('Hi');
    expect(takePendingFirstTurn('s3')).toBeUndefined();
  });
});

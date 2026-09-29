type ContainerType = 'object' | 'array';

type ScanState = 'preamble' | 'keyStart' | 'inKey' | 'afterKey' | 'valueStart' | 'inString' | 'inScalar' | 'afterValue' | 'done';

type StringSink = 'discard' | 'key' | 'reply';

type TrackedKey = 'reply' | 'changeSet';

export type ChangeSetElement = Record<string, unknown> & { op: string };

const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

const SCALAR_DELIMITERS = new Set([',', '}', ']', ' ', '\t', '\n', '\r']);

const HEX_DIGIT = /^[0-9a-fA-F]$/;

const REPLY_KEY = 'reply';

const CHANGE_SET_KEY = 'changeSet';

const MAX_KEY_LENGTH = CHANGE_SET_KEY.length;

const CHANGE_SET_DEPTH = 2;

function parseElement(raw: string): ChangeSetElement | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return typeof (value as Record<string, unknown>).op === 'string' ? (value as ChangeSetElement) : null;
}

/**
 * `done` is terminal only once the top-level object closes with the reply string seen (`replySeen` true) —
 * reaching the end of a still-unmatched object before that (the `{` wasn't really the start of the payload)
 * instead resets to `preamble` so the scanner resyncs on the next real `{`, since a model narrating "I'll
 * fill the `{reply}` field…" is not exotic and must not kill the stream permanently.
 *
 * Every returned string is well-formed UTF-16: a `\uXXXX` escape or a literal surrogate pair split
 * across `push()` calls has its lone high surrogate held back and prepended to the next call's output
 * rather than ever being returned on its own — callers that UTF-8-encode a frame directly (not only
 * ones that round-trip it through `JSON.stringify`) depend on that.
 *
 * Each object element of the top-level `changeSet` array is captured raw and parsed the moment its closing
 * brace arrives; `takeChangeSetElements` hands over the ones completed so far.
 */
export class ReplyStreamScanner {
  private state: ScanState = 'preamble';
  private readonly stack: ContainerType[] = [];
  private sink: StringSink = 'discard';
  private pendingKey = '';
  private pendingKeyOverflowed = false;
  private valueKey: TrackedKey | null = null;
  private escapePending = false;
  private unicodeDigits: string | null = null;
  private pendingSurrogate = '';
  private replySeen = false;
  private changeSetOpen = false;
  private element: string | null = null;
  private elementClosed = false;
  private completed: ChangeSetElement[] = [];

  get replyFound(): boolean {
    return this.replySeen;
  }

  push(chunk: string): string {
    let output = this.pendingSurrogate;
    this.pendingSurrogate = '';
    const emit = (text: string): void => {
      output += text;
    };
    let i = 0;
    while (i < chunk.length && this.state !== 'done') {
      const char = chunk[i] as string;
      if (!this.step(char, emit)) continue;
      i++;
      if (this.element === null) continue;
      this.element += char;
      if (this.elementClosed) this.finishElement();
    }

    const lastCode = output.charCodeAt(output.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      this.pendingSurrogate = output[output.length - 1] as string;
      output = output.slice(0, -1);
    }
    return output;
  }

  takeChangeSetElements(): ChangeSetElement[] {
    const elements = this.completed;
    this.completed = [];
    return elements;
  }

  /** Returns whether `char` was consumed; a scalar's delimiter is left for `afterValue` to read. */
  private step(char: string, emit: (text: string) => void): boolean {
    switch (this.state) {
      case 'preamble':
        if (char === '{') {
          this.stack.push('object');
          this.state = 'keyStart';
        }
        return true;

      case 'keyStart':
        if (char === '"') {
          this.sink = 'key';
          this.pendingKey = '';
          this.pendingKeyOverflowed = false;
          this.state = 'inKey';
        } else if (char === '}') {
          this.closeContainer();
        }
        return true;

      case 'inKey':
        if (this.consumeStringChar(char) === 'end') {
          this.valueKey = this.trackedKey();
          this.state = 'afterKey';
        }
        return true;

      case 'afterKey':
        if (char === ':') this.state = 'valueStart';
        return true;

      case 'valueStart':
        return this.startValue(char);

      case 'inString':
        if (this.consumeStringChar(char, emit) === 'end') this.state = 'afterValue';
        return true;

      case 'inScalar':
        if (!SCALAR_DELIMITERS.has(char)) return true;
        this.state = 'afterValue';
        return false;

      case 'afterValue':
        if (char === ',') this.state = this.stack[this.stack.length - 1] === 'array' ? 'valueStart' : 'keyStart';
        else if (char === '}' || char === ']') this.closeContainer();
        return true;

      case 'done':
        return true;
    }
  }

  private startValue(char: string): boolean {
    if (/\s/.test(char)) return true;
    if (char === ']') {
      this.closeContainer();
      return true;
    }

    const key = this.valueKey;
    this.valueKey = null;
    if (char === '{' && this.changeSetOpen && this.stack.length === CHANGE_SET_DEPTH) {
      this.element = '';
      this.elementClosed = false;
    }

    if (char === '"') {
      this.sink = key === 'reply' && !this.replySeen ? 'reply' : 'discard';
      if (this.sink === 'reply') this.replySeen = true;
      this.state = 'inString';
      return true;
    }
    if (char === '{') {
      this.stack.push('object');
      this.state = 'keyStart';
      return true;
    }
    if (char === '[') {
      if (key === 'changeSet') this.changeSetOpen = true;
      this.stack.push('array');
      this.state = 'valueStart';
      return true;
    }
    this.state = 'inScalar';
    return false;
  }

  private trackedKey(): TrackedKey | null {
    if (this.stack.length !== 1 || this.pendingKeyOverflowed) return null;
    if (this.pendingKey === REPLY_KEY) return 'reply';
    return this.pendingKey === CHANGE_SET_KEY ? 'changeSet' : null;
  }

  private finishElement(): void {
    const element = parseElement(this.element ?? '');
    this.element = null;
    this.elementClosed = false;
    if (element) this.completed.push(element);
  }

  private closeContainer(): void {
    this.stack.pop();
    const depth = this.stack.length;
    if (this.element !== null && depth === CHANGE_SET_DEPTH) this.elementClosed = true;
    if (this.changeSetOpen && depth < CHANGE_SET_DEPTH) this.changeSetOpen = false;
    if (depth > 0) {
      this.state = 'afterValue';
      return;
    }
    if (this.replySeen) {
      this.state = 'done';
      return;
    }
    this.resetForPreamble();
  }

  private resetForPreamble(): void {
    this.state = 'preamble';
    this.sink = 'discard';
    this.pendingKey = '';
    this.pendingKeyOverflowed = false;
    this.valueKey = null;
    this.escapePending = false;
    this.unicodeDigits = null;
    this.changeSetOpen = false;
    this.element = null;
    this.elementClosed = false;
  }

  private consumeStringChar(char: string, emit?: (text: string) => void): 'end' | 'continue' {
    const append = (text: string) => {
      if (this.sink === 'key') {
        if (this.pendingKey.length < MAX_KEY_LENGTH) this.pendingKey += text;
        else this.pendingKeyOverflowed = true;
      } else if (this.sink === 'reply') {
        emit?.(text);
      }
    };

    if (this.unicodeDigits !== null) {
      if (!HEX_DIGIT.test(char)) {
        this.unicodeDigits = null;
        return this.consumeStringChar(char, emit);
      }
      this.unicodeDigits += char;
      if (this.unicodeDigits.length === 4) {
        const code = Number.parseInt(this.unicodeDigits, 16);
        this.unicodeDigits = null;
        append(String.fromCharCode(code));
      }
      return 'continue';
    }

    if (this.escapePending) {
      this.escapePending = false;
      if (char === 'u') {
        this.unicodeDigits = '';
        return 'continue';
      }
      append(SIMPLE_ESCAPES[char] ?? char);
      return 'continue';
    }

    if (char === '\\') {
      this.escapePending = true;
      return 'continue';
    }

    if (char === '"') return 'end';

    append(char);
    return 'continue';
  }
}

type ContainerType = 'object' | 'array';

type ScanState = 'preamble' | 'keyStart' | 'inKey' | 'afterKey' | 'valueStart' | 'inString' | 'inScalar' | 'afterValue' | 'done';

type StringSink = 'discard' | 'key' | 'reply';

const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

const SCALAR_DELIMITERS = new Set([',', '}', ']', ' ', '\t', '\n', '\r']);

const HEX_DIGIT = /^[0-9a-fA-F]$/;

const TARGET_KEY = 'reply';

/**
 * `done` is terminal only once the reply string has actually closed (`replySeen` true) — reaching the
 * end of a still-unmatched object before that (the `{` wasn't really the start of the payload) instead
 * resets to `preamble` so the scanner resyncs on the next real `{`, since a model narrating "I'll fill
 * the `{reply}` field…" is not exotic and must not kill the stream permanently.
 *
 * Every returned string is well-formed UTF-16: a `\uXXXX` escape or a literal surrogate pair split
 * across `push()` calls has its lone high surrogate held back and prepended to the next call's output
 * rather than ever being returned on its own — callers that UTF-8-encode a frame directly (not only
 * ones that round-trip it through `JSON.stringify`) depend on that.
 */
export class ReplyStreamScanner {
  private state: ScanState = 'preamble';
  private readonly stack: ContainerType[] = [];
  private sink: StringSink = 'discard';
  private pendingKey = '';
  private pendingKeyOverflowed = false;
  private nextValueIsReply = false;
  private escapePending = false;
  private unicodeDigits: string | null = null;
  private pendingSurrogate = '';
  private replySeen = false;

  get replyFound(): boolean {
    return this.replySeen;
  }

  push(chunk: string): string {
    let output = this.pendingSurrogate;
    this.pendingSurrogate = '';
    let i = 0;
    while (i < chunk.length) {
      if (this.state === 'done') break;
      const char = chunk[i] as string;

      switch (this.state) {
        case 'preamble':
          if (char === '{') {
            this.stack.push('object');
            this.state = 'keyStart';
          }
          i++;
          break;

        case 'keyStart':
          if (char === '"') {
            this.sink = 'key';
            this.pendingKey = '';
            this.pendingKeyOverflowed = false;
            this.state = 'inKey';
          } else if (char === '}') {
            this.closeContainer();
          }
          i++;
          break;

        case 'inKey':
          if (this.consumeStringChar(char) === 'end') {
            this.nextValueIsReply = this.stack.length === 1 && !this.pendingKeyOverflowed && this.pendingKey === TARGET_KEY;
            this.state = 'afterKey';
          }
          i++;
          break;

        case 'afterKey':
          if (char === ':') this.state = 'valueStart';
          i++;
          break;

        case 'valueStart':
          if (char === '"') {
            this.sink = this.nextValueIsReply ? 'reply' : 'discard';
            if (this.sink === 'reply') this.replySeen = true;
            this.state = 'inString';
            i++;
          } else if (char === '{') {
            this.nextValueIsReply = false;
            this.stack.push('object');
            this.state = 'keyStart';
            i++;
          } else if (char === '[') {
            this.nextValueIsReply = false;
            this.stack.push('array');
            this.state = 'valueStart';
            i++;
          } else if (char === ']') {
            this.closeContainer();
            i++;
          } else if (/\s/.test(char)) {
            i++;
          } else {
            this.nextValueIsReply = false;
            this.state = 'inScalar';
          }
          break;

        case 'inString':
          if (this.consumeStringChar(char, text => (output += text)) === 'end') this.state = this.sink === 'reply' ? 'done' : 'afterValue';
          i++;
          break;

        case 'inScalar':
          // The delimiter itself belongs to whatever reads it next (comma/brace/bracket in afterValue),
          // so it is deliberately left unconsumed here rather than duplicating the closer logic.
          if (SCALAR_DELIMITERS.has(char)) this.state = 'afterValue';
          else i++;
          break;

        case 'afterValue':
          if (char === ',') {
            this.state = this.stack[this.stack.length - 1] === 'array' ? 'valueStart' : 'keyStart';
            i++;
          } else if (char === '}' || char === ']') {
            this.closeContainer();
            i++;
          } else {
            i++;
          }
          break;
      }
    }

    const lastCode = output.charCodeAt(output.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      this.pendingSurrogate = output[output.length - 1] as string;
      output = output.slice(0, -1);
    }
    return output;
  }

  private closeContainer(): void {
    this.stack.pop();
    if (this.stack.length > 0) {
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
    this.nextValueIsReply = false;
    this.escapePending = false;
    this.unicodeDigits = null;
  }

  private consumeStringChar(char: string, emit?: (text: string) => void): 'end' | 'continue' {
    const append = (text: string) => {
      if (this.sink === 'key') {
        if (this.pendingKey.length < TARGET_KEY.length) this.pendingKey += text;
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

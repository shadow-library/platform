/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import { type BaseMessage } from '@langchain/core/messages';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function formatMessagesAsPrompt(messages: BaseMessage[]): string {
  return messages
    .map(m => {
      const role = m._getType() === 'human' ? 'Human' : m._getType() === 'ai' ? 'Assistant' : 'System';
      return `${role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
    })
    .join('\n\n');
}

// stdin is ignored so the CLI never blocks waiting on piped input when the prompt is passed as an arg.
async function spawnAndCapture(bin: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([bin, ...args], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Subprocess exited ${exitCode}: ${stderr.trim()}`);
  }
  return stdout.trim();
}

// Claude Code subprocess provider — runs the `claude` CLI non-interactively. `model` selects an alias
// (e.g. sonnet, haiku) via `--model`; omit to use the CLI's configured default.
export class ChatClaudeCode extends SimpleChatModel {
  private readonly bin: string;
  private readonly model?: string;

  constructor(bin: string, model?: string) {
    super({});
    this.bin = bin;
    this.model = model;
  }

  _llmType(): string {
    return 'anthropic-claude-code';
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const prompt = formatMessagesAsPrompt(messages);
    const args = ['-p', prompt];
    if (this.model) args.push('--model', this.model);
    return spawnAndCapture(this.bin, args);
  }
}

// Codex subprocess provider — runs `codex exec` (the CLI's configured GPT model) non-interactively.
export class ChatCodex extends SimpleChatModel {
  private readonly bin: string;

  constructor(bin: string) {
    super({});
    this.bin = bin;
  }

  _llmType(): string {
    return 'openai-codex';
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const prompt = formatMessagesAsPrompt(messages);
    // `codex exec` runs non-interactively; `--output-last-message` writes only the final assistant
    // message to a file, keeping the session banner and token summary out of the parsed response.
    const outFile = join(tmpdir(), `nf-codex-${randomUUID()}.txt`);
    try {
      await spawnAndCapture(this.bin, ['exec', '--skip-git-repo-check', '--color', 'never', '--output-last-message', outFile, prompt]);
      return (await readFile(outFile, 'utf8')).trim();
    } finally {
      await rm(outFile, { force: true }).catch(() => undefined);
    }
  }
}

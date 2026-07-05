/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
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

async function spawnAndCapture(bin: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([bin, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Subprocess exited ${exitCode}: ${stderr.trim()}`);
  }
  return stdout.trim();
}

export class ChatClaudeCode extends SimpleChatModel {
  private readonly bin: string;

  constructor(bin: string) {
    super({});
    this.bin = bin;
  }

  _llmType(): string {
    return 'anthropic-claude-code';
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const prompt = formatMessagesAsPrompt(messages);
    return spawnAndCapture(this.bin, ['-p', prompt]);
  }
}

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
    return spawnAndCapture(this.bin, ['--full-auto', '--quiet', prompt]);
  }
}

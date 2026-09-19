import { describe, expect, it } from 'bun:test';

import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { parseSchema } from '@modules/ai/schemas/validate';
import { ChatTitleSchema } from '@modules/ai/schemas';

describe('chat-title prompt', () => {
  it('should register on the title role, analytical kind, version 1.0.0', () => {
    const prompt = PROMPT_REGISTRY['chat-title'];
    expect(prompt).toMatchObject({ key: 'chat-title', version: '1.0.0', kind: 'analytical', role: 'title' });
  });

  it('should render the system message followed by the opening message', async () => {
    const messages = await PROMPT_REGISTRY['chat-title'].template.formatMessages({
      message: 'Kaela swore she would never draw the blade again — but chapter 12 has her drawing it.',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.getType()).toBe('system');
    expect(messages[1]?.getType()).toBe('human');
    expect(String(messages[1]?.content)).toContain('Kaela swore she would never draw the blade again');
  });

  it('should tell the model to name the ask, not the story, and to work from the opening message alone', () => {
    const system = PROMPT_REGISTRY['chat-title'].system;
    expect(system).toContain('there is no reply yet');
    expect(system).toContain('not what the novel is about');
    expect(system).toContain('name the action itself');
    expect(system).toContain('never invent a character, place, or plot detail');
  });

  it('should carry the JSON-only emission contract', () => {
    const system = PROMPT_REGISTRY['chat-title'].system;
    expect(system).toContain('Respond with ONLY one valid JSON object');
    expect(system).toContain('{"title": "..."}');
  });
});

describe('ChatTitleSchema', () => {
  it('should accept a short title', () => {
    expect(parseSchema(ChatTitleSchema, { title: "Kaela's contradicted vow" }).success).toBe(true);
  });

  it('should reject a missing title', () => {
    expect(parseSchema(ChatTitleSchema, {}).success).toBe(false);
  });

  it('should reject an empty title', () => {
    expect(parseSchema(ChatTitleSchema, { title: '' }).success).toBe(false);
  });

  it('should reject a title longer than 60 characters', () => {
    expect(parseSchema(ChatTitleSchema, { title: 'x'.repeat(61) }).success).toBe(false);
  });
});

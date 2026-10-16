import { type ResolveNeeds } from '@modules/catalog';
import { type ChatMessage, type ChatRequestBody } from '@modules/providers';

function hasImagePart(message: ChatMessage): boolean {
  const content = message.content;
  return Array.isArray(content) && content.some(part => typeof part === 'object' && part !== null && part.type === 'image_url');
}

export function chatNeeds(body: ChatRequestBody): ResolveNeeds {
  return { tools: Array.isArray(body.tools) && body.tools.length > 0, vision: body.messages.some(hasImagePart), streaming: body.stream === true };
}

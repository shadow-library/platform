import { ownEntry } from '@/features/catalog/catalog-values';

const WORD_SEPARATOR = /[-_\s]+/;

const WINDOW_NAMES: Readonly<Record<string, string>> = { '1h': 'per hour', '1d': 'per day', '30d': 'per 30 days' };
const SCOPE_NAMES: Readonly<Record<string, string>> = { subject: 'each user', app: 'whole app' };
const EFFORT_NAMES: Readonly<Record<string, string>> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Maximum',
};
const DATA_POLICY_NAMES: Readonly<Record<string, string>> = { any: 'Any provider', in_cluster_only: 'Only models running inside our cluster' };
const TASK_KIND_NAMES: Readonly<Record<string, string>> = { chat: 'Chat', embedding: 'Embeddings', image: 'Image generation' };
const BRAND_WORDS: Readonly<Record<string, string>> = { openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' };
const CAPABILITY_NAMES: Readonly<Record<string, string>> = {
  tools: 'Tools',
  structured_output: 'Structured output',
  vision: 'Vision',
  streaming: 'Streaming',
  image_output: 'Image output',
  embedding: 'Embeddings',
};

function words(key: string): string[] {
  return key.split(WORD_SEPARATOR).filter(word => word.length > 0);
}

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function titleCase(key: string): string {
  return words(key).map(capitalise).join(' ');
}

export function sentenceCase(key: string): string {
  return capitalise(words(key).join(' '));
}

const labelled = (label: string | undefined, fallback: string): string => (label?.trim() ? label.trim() : fallback);

export function appName(app: string): string {
  return titleCase(app);
}

export function taskName(task: { name: string; label?: string }): string {
  return labelled(task.label, sentenceCase(task.name));
}

/** "Novel Forge · Chat": how a task is named wherever its app is not already on screen. */
export function taskTitle(task: { app: string; name: string; label?: string }): string {
  return `${appName(task.app)} · ${taskName(task)}`;
}

export function modelName(model: { key: string; label?: string }): string {
  return labelled(model.label, model.key);
}

export function aliasName(alias: { key: string; label?: string }): string {
  return labelled(alias.label, alias.key);
}

export function providerName(provider: string): string {
  return words(provider)
    .map(word => ownEntry(BRAND_WORDS, word.toLowerCase()) ?? capitalise(word))
    .join(' ');
}

export function selectorName(selector: string): string {
  return sentenceCase(selector);
}

export function windowName(window: string): string {
  return ownEntry(WINDOW_NAMES, window) ?? `per ${window}`;
}

export function scopeName(scope: string): string {
  return ownEntry(SCOPE_NAMES, scope) ?? scope;
}

export function effortName(effort: string): string {
  return ownEntry(EFFORT_NAMES, effort) ?? sentenceCase(effort);
}

export function dataPolicyName(policy: string): string {
  return ownEntry(DATA_POLICY_NAMES, policy) ?? sentenceCase(policy);
}

export function taskKindName(kind: string): string {
  return ownEntry(TASK_KIND_NAMES, kind) ?? sentenceCase(kind);
}

export function capabilityName(capability: string): string {
  return ownEntry(CAPABILITY_NAMES, capability) ?? sentenceCase(capability);
}

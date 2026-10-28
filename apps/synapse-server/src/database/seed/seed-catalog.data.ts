import { utils } from '@shadow-library/common';

import { type CatalogDocument } from '@modules/catalog/catalog.types';

export const UNRESTRICTED_LLM_ALLOWLIST: readonly string[] = Object.freeze(['x-ai/grok-4.6', 'deepseek/deepseek-v4-pro', 'z-ai/glm-5.2', 'moonshotai/kimi-k3']);

export const SEED_CATALOG_DATA = utils.object.deepFreeze<Omit<CatalogDocument, 'providers'>>({
  models: {
    'grok-4.6': {
      label: 'Grok 4.6',
      version: '4.6',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 500000,
        reasoning: 'mandatory',
        efforts: ['xhigh', 'high', 'medium', 'low'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 2,
        output: 6,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'x-ai/grok-4.6',
        },
        {
          provider: 'openrouter',
          id: 'x-ai/grok-4.6',
        },
      ],
    },
    'grok-4.3': {
      label: 'Grok 4.3',
      version: '4.3',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1000000,
        reasoning: 'optional',
        efforts: ['high', 'medium', 'low', 'none'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 1.25,
        output: 2.5,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'x-ai/grok-4.3',
        },
      ],
    },
    'claude-sonnet-5': {
      label: 'Claude Sonnet 5',
      version: '5',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1000000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low'],
        promptCache: 'anthropic',
        sampling: true,
        maxOptionalProperties: 24,
      },
      pricePerMTok: {
        input: 2,
        output: 10,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'anthropic/claude-sonnet-5',
        },
        {
          provider: 'openrouter',
          id: 'anthropic/claude-sonnet-5',
        },
      ],
    },
    'claude-opus-5.5': {
      label: 'Claude Opus 5.5',
      version: '5.5',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1000000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low'],
        promptCache: 'anthropic',
        sampling: true,
        maxOptionalProperties: 24,
      },
      pricePerMTok: {
        input: 4,
        output: 20,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'anthropic/claude-opus-5.5',
        },
        {
          provider: 'openrouter',
          id: 'anthropic/claude-opus-5.5',
        },
      ],
    },
    'claude-opus-5': {
      label: 'Claude Opus 5',
      version: '5',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1000000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low'],
        promptCache: 'anthropic',
        sampling: true,
        maxOptionalProperties: 24,
      },
      pricePerMTok: {
        input: 5,
        output: 25,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'anthropic/claude-opus-5',
        },
        {
          provider: 'openrouter',
          id: 'anthropic/claude-opus-5',
        },
      ],
    },
    'claude-haiku-4.5': {
      label: 'Claude Haiku 4.5',
      version: '4.5',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 200000,
        reasoning: 'optional',
        promptCache: 'anthropic',
        sampling: true,
        maxOptionalProperties: 24,
      },
      pricePerMTok: {
        input: 1,
        output: 5,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'anthropic/claude-haiku-4.5',
        },
        {
          provider: 'openrouter',
          id: 'anthropic/claude-haiku-4.5',
        },
      ],
    },
    'gpt-5.4': {
      label: 'GPT-5.4',
      version: '5.4',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1050000,
        reasoning: 'optional',
        efforts: ['xhigh', 'high', 'medium', 'low', 'none'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 2.5,
        output: 15,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'openai/gpt-5.4',
        },
      ],
    },
    'gpt-5.6-luna': {
      label: 'GPT-5.6 Luna',
      version: '5.6',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1050000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low', 'none'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.2,
        output: 1.2,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'openai/gpt-5.6-luna',
        },
        {
          provider: 'openrouter',
          id: 'openai/gpt-5.6-luna',
        },
      ],
    },
    'gpt-5.6-sol': {
      label: 'GPT-5.6 Sol',
      version: '5.6',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1050000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'medium', 'low', 'none'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 2,
        output: 10,
      },
      deployments: [
        {
          provider: 'subscription',
          id: 'openai/gpt-5.6-sol',
        },
        {
          provider: 'openrouter',
          id: 'openai/gpt-5.6-sol',
        },
      ],
    },
    'gpt-5.4-mini': {
      label: 'GPT-5.4 Mini',
      version: '5.4',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 400000,
        reasoning: 'optional',
        efforts: ['xhigh', 'high', 'medium', 'low', 'none'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.75,
        output: 4.5,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'openai/gpt-5.4-mini',
        },
      ],
    },
    'kimi-k3': {
      label: 'Kimi K3',
      version: 'k3',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1000000,
        reasoning: 'optional',
        efforts: ['max', 'high', 'low'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 3,
        output: 15,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'moonshotai/kimi-k3',
        },
      ],
    },
    'kimi-k2.6': {
      label: 'Kimi K2.6',
      version: 'k2.6',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 262000,
        reasoning: 'optional',
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.54,
        output: 2.28,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'moonshotai/kimi-k2.6',
        },
      ],
    },
    'glm-5.2': {
      label: 'GLM 5.2',
      version: '5.2',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: false,
        context: 1050000,
        reasoning: 'optional',
        efforts: ['xhigh', 'high'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.97,
        output: 3.04,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'z-ai/glm-5.2',
        },
      ],
    },
    'glm-5.3': {
      label: 'GLM 5.3',
      version: '5.3',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: false,
        context: 1050000,
        reasoning: 'mandatory',
        efforts: ['max', 'high', 'low'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 1.4,
        output: 4.4,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'z-ai/glm-5.3',
        },
      ],
    },
    'deepseek-v4-pro': {
      label: 'DeepSeek V4 Pro',
      version: 'v4',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: false,
        context: 1050000,
        reasoning: 'optional',
        efforts: ['xhigh', 'high'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.41,
        output: 0.83,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'deepseek/deepseek-v4-pro',
        },
      ],
    },
    'gemini-3.7-flash': {
      label: 'Gemini 3.7 Flash',
      version: '3.7',
      capabilities: {
        tools: true,
        structuredOutput: 'native',
        vision: true,
        context: 1050000,
        reasoning: 'mandatory',
        efforts: ['high', 'medium', 'low'],
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0.375,
        output: 1.875,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'google/gemini-3.7-flash',
        },
      ],
    },
    'grok-imagine-image-2.0': {
      label: 'Grok Imagine Image 2.0',
      version: '2.0',
      capabilities: {
        tools: false,
        structuredOutput: 'prompt',
        vision: false,
        imageOutput: true,
        reasoning: 'none',
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0,
        output: 0,
        perImage: 0.04,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'x-ai/grok-imagine-image-2.0',
        },
      ],
    },
    'gpt-5.4-image-2': {
      label: 'GPT-5.4 Image 2',
      version: '5.4',
      capabilities: {
        tools: false,
        structuredOutput: 'prompt',
        vision: false,
        imageOutput: true,
        reasoning: 'none',
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0,
        output: 0,
        perImage: 0.04,
      },
      deployments: [
        {
          provider: 'openrouter',
          id: 'openai/gpt-5.4-image-2',
        },
      ],
    },
    'qwen3-embedding:0.6b': {
      label: 'Qwen3 Embedding 0.6B',
      capabilities: {
        tools: false,
        structuredOutput: 'prompt',
        vision: false,
        embedding: {
          dimensions: 1024,
        },
        reasoning: 'none',
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0,
        output: 0,
      },
      deployments: [
        {
          provider: 'local',
          id: 'qwen3-embedding:0.6b',
        },
      ],
    },
    'llama3.1': {
      label: 'Llama 3.1',
      capabilities: {
        tools: false,
        structuredOutput: 'prompt',
        vision: false,
        reasoning: 'none',
        promptCache: 'none',
        sampling: true,
      },
      pricePerMTok: {
        input: 0,
        output: 0,
      },
      deployments: [
        {
          provider: 'local',
          id: 'llama3.1',
        },
      ],
    },
  },
  aliases: {
    opus: {
      label: 'Opus',
      model: 'claude-opus-5.5',
      showVersion: false,
      state: 'active',
    },
    sonnet: {
      label: 'Sonnet',
      model: 'claude-sonnet-5',
      showVersion: false,
      state: 'active',
    },
    haiku: {
      label: 'Haiku',
      model: 'claude-haiku-4.5',
      showVersion: false,
      state: 'active',
    },
    grok: {
      label: 'Grok',
      model: 'grok-4.6',
      showVersion: false,
      state: 'active',
    },
    'gpt-sol': {
      label: 'GPT Sol',
      model: 'gpt-5.6-sol',
      showVersion: false,
      state: 'active',
    },
    'gpt-luna': {
      label: 'GPT Luna',
      model: 'gpt-5.6-luna',
      showVersion: false,
      state: 'active',
    },
    gpt: {
      label: 'GPT',
      model: 'gpt-5.4',
      showVersion: false,
      state: 'active',
    },
    'gpt-mini': {
      label: 'GPT Mini',
      model: 'gpt-5.4-mini',
      showVersion: false,
      state: 'active',
    },
    kimi: {
      label: 'Kimi',
      model: 'kimi-k3',
      showVersion: false,
      state: 'active',
    },
    glm: {
      label: 'GLM',
      model: 'glm-5.2',
      showVersion: false,
      state: 'active',
    },
    deepseek: {
      label: 'DeepSeek',
      model: 'deepseek-v4-pro',
      showVersion: false,
      state: 'active',
    },
    'gemini-flash': {
      label: 'Gemini Flash',
      model: 'gemini-3.7-flash',
      showVersion: false,
      state: 'active',
    },
  },
  tasks: {
    'novel-forge.writing': {
      label: 'Chapter writing',
      description: "Writes and rewrites chapter prose in your story's voice.",
      kind: 'chat',
      requires: ['streaming'],
      dataPolicy: 'any',
      effort: {
        default: 'low',
        min: 'low',
        max: 'high',
      },
      routes: [
        {
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'claude-haiku-4.5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'grok-4.6',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'kimi-k3',
        },
      ],
    },
    'novel-forge.planning': {
      label: 'Story planning',
      description: 'Builds your premise, outline, chapter plan and story bible, and pulls characters and facts out of your text.',
      kind: 'chat',
      requires: ['structured_output'],
      dataPolicy: 'any',
      effort: {
        default: 'medium',
        min: 'low',
        max: 'high',
      },
      routes: [
        {
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'glm-5.2',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'kimi-k3',
        },
      ],
    },
    'novel-forge.review': {
      label: 'Manuscript review',
      description: 'Checks chapters for quality, continuity and consistency with your story bible.',
      kind: 'chat',
      requires: ['structured_output'],
      dataPolicy: 'any',
      effort: {
        default: 'low',
        min: 'low',
        max: 'high',
      },
      routes: [
        {
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'claude-haiku-4.5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'kimi-k3',
        },
      ],
    },
    'novel-forge.chat': {
      label: 'Chat',
      description: 'Talks through ideas with you as a writing coach.',
      kind: 'chat',
      requires: ['tools', 'streaming'],
      dataPolicy: 'any',
      effort: {
        default: 'low',
        min: 'low',
        max: 'high',
      },
      routes: [
        {
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'claude-sonnet-5',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'glm-5.2',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'claude-opus-5.5',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'kimi-k3',
        },
      ],
    },
    'novel-forge.helper': {
      label: 'Quick helper',
      description: 'Handles small background jobs such as chapter titles, condensing context, and composing image prompts.',
      kind: 'chat',
      requires: [],
      dataPolicy: 'any',
      effort: {
        default: 'none',
      },
      routes: [
        {
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'deepseek-v4-pro',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'claude-haiku-4.5',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'glm-5.2',
        },
      ],
    },
    'novel-forge.image': {
      label: 'Illustrations and covers',
      description: 'Generates book covers and illustrations of your characters, places and scenes from your descriptions.',
      kind: 'image',
      requires: ['image_output'],
      dataPolicy: 'any',
      routes: [
        {
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'grok-imagine-image-2.0',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'grok-imagine-image-2.0',
        },
      ],
    },
    'novel-forge.vision': {
      label: 'Image understanding',
      description: "Looks at a reference image you upload and writes down the subject's appearance.",
      kind: 'chat',
      requires: ['vision'],
      effort: { default: 'none' },
      dataPolicy: 'any',
      routes: [
        {
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'grok-4.6',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'grok-4.6',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'gpt-5.6-luna',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'grok-4.6',
        },
      ],
    },
    'novel-forge.embedding': {
      label: 'Story search',
      description: 'Indexes your story so related notes and passages can be found by meaning.',
      kind: 'embedding',
      requires: ['embedding'],
      dataPolicy: 'any',
      pinned: true,
      routes: [
        {
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'standard',
          },
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'economy',
            content_mode: 'unrestricted',
          },
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'standard',
          },
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'balanced',
            content_mode: 'unrestricted',
          },
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'standard',
          },
          model: 'qwen3-embedding:0.6b',
        },
        {
          when: {
            tier: 'performant',
            content_mode: 'unrestricted',
          },
          model: 'qwen3-embedding:0.6b',
        },
      ],
    },
    'memoir.insight': {
      label: 'Insight',
      description: 'Answers your questions about your habits and quests, with patterns and suggested next steps.',
      kind: 'chat',
      requires: ['structured_output'],
      dataPolicy: 'any',
      routes: [
        {
          model: 'llama3.1',
        },
      ],
    },
    'memoir.receipt-structuring': {
      label: 'Receipt structuring',
      description: 'Reads scanned receipt text and fills in the total, merchant, category, date and line items.',
      kind: 'chat',
      requires: ['structured_output'],
      dataPolicy: 'any',
      routes: [
        {
          model: 'llama3.1',
        },
      ],
    },
  },
  budgets: [
    {
      app: 'novel-forge',
      per: 'subject',
      window: '1h',
      maxCalls: 1000,
      maxListCostUsd: 50,
    },
  ],
});

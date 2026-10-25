import { describe, expect, it } from 'bun:test';

import { type CatalogParseResult, parseCatalogDocument } from '@modules/catalog/catalog-parser';
import { type CatalogIssue } from '@modules/catalog/catalog.types';

import { catalogDocument } from './catalog.fixtures';

function issuesOf(result: CatalogParseResult): Pick<CatalogIssue, 'path' | 'code'>[] {
  if (result.ok) return [];
  return result.issues.map(({ path, code }) => ({ path, code }));
}

function parseWith(change: (document: Record<string, any>) => void): CatalogParseResult {
  const document: Record<string, any> = catalogDocument();
  change(document);
  return parseCatalogDocument(document);
}

describe('parseCatalogDocument', () => {
  it('should narrow a well-formed document to the same value', () => {
    const document = catalogDocument();
    expect(parseCatalogDocument(document)).toEqual({ ok: true, document });
  });

  it('should leave optional fields absent rather than undefined', () => {
    const result = parseCatalogDocument(catalogDocument());
    if (!result.ok) throw new TypeError('expected the fixture to parse');
    expect(Object.keys(result.document.providers.local!)).toEqual(['kind', 'url', 'locality', 'cost']);
  });

  it('should reject a document that is not an object at the root path', () => {
    for (const input of [null, [], 'catalog', 42]) expect(issuesOf(parseCatalogDocument(input))).toEqual([{ path: '', code: 'invalid_type' }]);
  });

  it('should reject a misspelt top-level key instead of ignoring it', () => {
    const result = parseWith(document => {
      document.budget = document.budgets;
    });
    expect(issuesOf(result)).toEqual([{ path: 'budget', code: 'unknown_field' }]);
  });

  it('should reject unknown fields at every nesting level', () => {
    const result = parseWith(document => {
      document.aliases.opus.showversion = true;
      document.tasks['novel-forge.chat'].routes[1].modle = 'x';
    });
    expect(issuesOf(result)).toEqual([
      { path: 'aliases.opus.showversion', code: 'unknown_field' },
      { path: 'tasks.novel-forge.chat.routes[1].modle', code: 'unknown_field' },
    ]);
  });

  it('should report each missing required field at its own path', () => {
    const result = parseWith(document => {
      delete document.models['grok-4.6'].label;
      delete document.budgets;
    });
    expect(issuesOf(result)).toEqual([
      { path: 'models.grok-4.6.label', code: 'missing_field' },
      { path: 'budgets', code: 'missing_field' },
    ]);
  });

  it('should reject a value outside its enumeration', () => {
    const result = parseWith(document => {
      document.providers.local.locality = 'cluster';
      document.tasks['novel-forge.chat'].effort.default = 'extreme';
      document.tasks['memoir.insight'].requires = ['json'];
    });
    expect(issuesOf(result)).toEqual([
      { path: 'providers.local.locality', code: 'invalid_value' },
      { path: 'tasks.novel-forge.chat.effort.default', code: 'invalid_value' },
      { path: 'tasks.memoir.insight.requires[0]', code: 'invalid_value' },
    ]);
  });

  it('should report a field of the wrong type without also reporting its children', () => {
    const result = parseWith(document => {
      document.providers.local = 'ollama';
      document.tasks['novel-forge.chat'].routes = {};
    });
    expect(issuesOf(result)).toEqual([
      { path: 'providers.local', code: 'invalid_type' },
      { path: 'tasks.novel-forge.chat.routes', code: 'invalid_type' },
    ]);
  });

  it('should reject negative, fractional, non-finite and null numbers', () => {
    const result = parseWith(document => {
      document.models['grok-4.6'].pricePerMTok.input = -1;
      document.providers.subscription.maxInflightPerReplica = 1.5;
      document.budgets[0].maxListCostUsd = Infinity;
      document.models['llama3.1'].capabilities.context = null;
    });
    expect(issuesOf(result)).toEqual([
      { path: 'providers.subscription.maxInflightPerReplica', code: 'invalid_value' },
      { path: 'models.grok-4.6.pricePerMTok.input', code: 'invalid_value' },
      { path: 'models.llama3.1.capabilities.context', code: 'invalid_type' },
      { path: 'budgets[0].maxListCostUsd', code: 'invalid_type' },
    ]);
  });

  it('should reject an unknown provider flavor', () => {
    const result = parseWith(document => {
      document.providers.openrouter.flavor = 'azure';
    });
    expect(issuesOf(result)).toEqual([{ path: 'providers.openrouter.flavor', code: 'invalid_value' }]);
  });

  it('should accept only an apiKeyConfig from the provider credential allowlist', () => {
    for (const key of ['sk-or-v1-0123456789', 'auth.client.secret', 'database.postgres.url']) {
      const result = parseWith(document => {
        document.providers.openrouter.apiKeyConfig = key;
      });
      expect(issuesOf(result)).toEqual([{ path: 'providers.openrouter.apiKeyConfig', code: 'invalid_value' }]);
    }
  });

  it('should accept OpenRouter host slugs to ignore and reject an empty list or a malformed slug', () => {
    const named = parseWith(document => (document.models['claude-opus-5.5'].deployments[1].ignoreHosts = ['azure', 'google-vertex/global']));
    expect(issuesOf(named)).toEqual([]);
    expect(issuesOf(parseWith(document => (document.models['claude-opus-5.5'].deployments[1].ignoreHosts = [])))).toEqual([
      { path: 'models.claude-opus-5.5.deployments[1].ignoreHosts', code: 'invalid_value' },
    ]);
    for (const slug of ['Azure', 'azure us', '/azure']) {
      const result = parseWith(document => (document.models['claude-opus-5.5'].deployments[1].ignoreHosts = [slug]));
      expect(issuesOf(result)).toEqual([{ path: 'models.claude-opus-5.5.deployments[1].ignoreHosts[0]', code: 'invalid_value' }]);
    }
  });

  it('should accept a credential named by its id and reject anything else', () => {
    const named = parseWith(document => {
      delete document.providers.openrouter.apiKeyConfig;
      document.providers.openrouter.credential = '00000000-0000-4000-8000-000000000001';
    });
    expect(issuesOf(named)).toEqual([]);
    for (const credential of ['openrouter', 'sk-or-v1-0123456789', '00000000-0000-4000-8000-00000000000A']) {
      const result = parseWith(document => {
        document.providers.openrouter.credential = credential;
      });
      expect(issuesOf(result)).toEqual([{ path: 'providers.openrouter.credential', code: 'invalid_value' }]);
    }
  });

  it('should reject a provider url that is not http or https', () => {
    for (const url of ['ftp://models.internal', 'not a url']) {
      const result = parseWith(document => {
        document.providers.local.url = url;
      });
      expect(issuesOf(result)).toEqual([{ path: 'providers.local.url', code: 'invalid_value' }]);
    }
  });

  it('should reject a provider url that embeds credentials', () => {
    for (const url of ['https://user:pass@openrouter.ai/api/v1', 'http://token@host.internal:11434']) {
      const result = parseWith(document => {
        document.providers.local.url = url;
      });
      expect(issuesOf(result)).toEqual([{ path: 'providers.local.url', code: 'invalid_value' }]);
    }
  });

  it('should reject an empty string and an empty efforts list', () => {
    const result = parseWith(document => {
      document.aliases.opus.label = '  ';
      document.models['grok-4.6'].capabilities.efforts = [];
    });
    expect(issuesOf(result)).toEqual([
      { path: 'models.grok-4.6.capabilities.efforts', code: 'invalid_value' },
      { path: 'aliases.opus.label', code: 'invalid_value' },
    ]);
  });

  it('should accept a task label and description', () => {
    const result = parseWith(document => {
      document.tasks['novel-forge.chat'].label = 'Chat';
      document.tasks['novel-forge.chat'].description = 'Talks through ideas with you.';
    });
    expect(issuesOf(result)).toEqual([]);
    expect(result.ok && result.document.tasks['novel-forge.chat']).toMatchObject({ label: 'Chat', description: 'Talks through ideas with you.' });
  });

  it('should reject a task label or description of the wrong type', () => {
    const result = parseWith(document => {
      document.tasks['novel-forge.chat'].label = 7;
      document.tasks['novel-forge.chat'].description = ['x'];
    });
    expect(issuesOf(result)).toEqual([
      { path: 'tasks.novel-forge.chat.label', code: 'invalid_type' },
      { path: 'tasks.novel-forge.chat.description', code: 'invalid_type' },
    ]);
  });

  it('should reject a task label past 60 characters and a description past 280', () => {
    const result = parseWith(document => {
      document.tasks['novel-forge.chat'].label = 'a'.repeat(61);
      document.tasks['novel-forge.chat'].description = 'a'.repeat(281);
    });
    expect(issuesOf(result)).toEqual([
      { path: 'tasks.novel-forge.chat.label', code: 'invalid_value' },
      { path: 'tasks.novel-forge.chat.description', code: 'invalid_value' },
    ]);
  });

  it('should accept a task label of exactly 60 characters and a description of exactly 280', () => {
    const result = parseWith(document => {
      document.tasks['novel-forge.chat'].label = 'a'.repeat(60);
      document.tasks['novel-forge.chat'].description = 'a'.repeat(280);
    });
    expect(issuesOf(result)).toEqual([]);
  });

  it('should reject an empty or whitespace-only task label or description', () => {
    const result = parseWith(document => {
      document.tasks['novel-forge.chat'].label = '';
      document.tasks['novel-forge.chat'].description = '   ';
    });
    expect(issuesOf(result)).toEqual([
      { path: 'tasks.novel-forge.chat.label', code: 'invalid_value' },
      { path: 'tasks.novel-forge.chat.description', code: 'invalid_value' },
    ]);
  });

  it('should reject a task key without an app prefix', () => {
    const result = parseWith(document => {
      document.tasks.chat = document.tasks['novel-forge.chat'];
    });
    expect(issuesOf(result)).toEqual([{ path: 'tasks.chat', code: 'invalid_key' }]);
  });

  it('should reject a __proto__ key without polluting the parsed record', () => {
    const input = JSON.parse(JSON.stringify(catalogDocument()).replace('"opus":', '"__proto__":'));
    const result = parseCatalogDocument(input);
    expect(issuesOf(result)).toEqual([{ path: 'aliases.__proto__', code: 'invalid_key' }]);
    expect(({} as Record<string, unknown>).label).toBeUndefined();
  });
});

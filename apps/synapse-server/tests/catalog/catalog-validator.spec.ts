import { describe, expect, it } from 'bun:test';

import { checkCatalogDocument, validateCatalog } from '@modules/catalog/catalog-validator';
import { type CatalogDocument, type CatalogIssue } from '@modules/catalog/catalog.types';

import { catalogDocument } from './catalog.fixtures';

function issues(document: CatalogDocument, active: CatalogDocument | null = null): Pick<CatalogIssue, 'path' | 'code'>[] {
  return validateCatalog(document, active).map(({ path, code }) => ({ path, code }));
}

describe('validateCatalog', () => {
  it('should accept the fixture on its own and against itself as the active document', () => {
    expect(issues(catalogDocument())).toEqual([]);
    expect(issues(catalogDocument(), catalogDocument())).toEqual([]);
  });

  describe('providers', () => {
    it('should require a flavor on an openai provider', () => {
      const document = catalogDocument(draft => delete draft.providers.openrouter!.flavor);
      expect(issues(document)).toEqual([{ path: 'providers.openrouter.flavor', code: 'missing_field' }]);
    });

    it('should reject a flavor on a provider of another kind', () => {
      const document = catalogDocument(draft => (draft.providers.local!.flavor = 'openai-compatible'));
      expect(issues(document)).toEqual([{ path: 'providers.local.flavor', code: 'invalid_value' }]);
    });

    it('should reject a provider naming both a credential and the deprecated apiKeyConfig', () => {
      const document = catalogDocument(draft => (draft.providers.openrouter!.credential = '00000000-0000-4000-8000-000000000001'));
      expect(issues(document)).toEqual([{ path: 'providers.openrouter.credential', code: 'invalid_value' }]);
    });

    it('should reject a credential on an ollama provider, which never sends one', () => {
      const document = catalogDocument(draft => (draft.providers.local!.credential = '00000000-0000-4000-8000-000000000001'));
      expect(issues(document)).toEqual([{ path: 'providers.local.credential', code: 'invalid_value' }]);
    });
  });

  describe('tools', () => {
    it('should require a credential on a brave web search and refuse one on a mock', () => {
      const brave = catalogDocument(draft => (draft.tools = { webSearch: { kind: 'brave', url: 'https://api.search.brave.com', maxSearches: 3, results: 5 } }));
      const mock = catalogDocument(
        draft => (draft.tools = { webSearch: { kind: 'mock', url: 'http://search.mock', credential: '00000000-0000-4000-8000-000000000001', maxSearches: 3, results: 5 } }),
      );

      expect(issues(brave)).toEqual([{ path: 'tools.webSearch.credential', code: 'missing_field' }]);
      expect(issues(mock)).toEqual([{ path: 'tools.webSearch.credential', code: 'invalid_value' }]);
    });
  });

  describe('references', () => {
    it('should reject a deployment naming an unknown provider', () => {
      const document = catalogDocument(draft => (draft.models['grok-4.6']!.deployments[0]!.provider = 'xai'));
      expect(issues(document)).toEqual([{ path: 'models.grok-4.6.deployments[0].provider', code: 'unknown_provider' }]);
    });

    it('should reject an alias targeting an unknown model', () => {
      const document = catalogDocument(draft => (draft.aliases.opus!.model = 'claude-opus-9'));
      expect(issues(document)).toEqual([{ path: 'aliases.opus.model', code: 'unknown_model' }]);
    });

    it('should reject a route naming an unknown model', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.routes[1]!.model = 'claude-opus-9'));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.chat.routes[1].model', code: 'unknown_model' }]);
    });

    it('should reject a task accepting an unknown alias', () => {
      const document = catalogDocument(draft => draft.tasks['novel-forge.chat']!.aliases!.push('sonnet'));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.chat.aliases[4]', code: 'unknown_alias' }]);
    });

    it('should reject a model without deployments', () => {
      const document = catalogDocument(draft => (draft.models['image-1']!.deployments = []));
      expect(issues(document)).toEqual([{ path: 'models.image-1.deployments', code: 'no_deployments' }]);
    });
  });

  describe('capabilities and kinds', () => {
    it('should reject a route model lacking a required capability', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.routes[0]!.model = 'llama3.1'));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.chat.routes[0].model', code: 'missing_capability' }]);
    });

    it('should reject a usable alias whose model lacks a required capability', () => {
      const document = catalogDocument(draft => (draft.aliases.preview!.model = 'llama3.1'));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.chat.aliases[3]', code: 'missing_capability' }]);
    });

    it('should not check a retired alias the task can never resolve to', () => {
      expect(catalogDocument().aliases.llama!.state).toBe('retired');
      expect(issues(catalogDocument())).toEqual([]);
    });

    it('should accept structured output from a model that only supports it through the prompt', () => {
      expect(catalogDocument().models['llama3.1']!.capabilities.structuredOutput).toBe('prompt');
      expect(issues(catalogDocument(draft => draft.tasks['memoir.insight']!.requires.push('structured_output')))).toEqual([]);
    });

    it('should reject an embedding, image or chat task routed to a model of another kind', () => {
      const document = catalogDocument(draft => {
        draft.tasks['novel-forge.embedding']!.pinned = false;
        draft.tasks['novel-forge.embedding']!.requires = [];
        draft.tasks['novel-forge.embedding']!.routes[0]!.model = 'llama3.1';
        draft.tasks['novel-forge.image']!.requires = [];
        draft.tasks['novel-forge.image']!.routes[0]!.model = 'llama3.1';
        draft.tasks['memoir.insight']!.routes[0]!.model = 'qwen3-embedding';
      });
      expect(issues(document)).toEqual([
        { path: 'tasks.novel-forge.embedding.routes[0].model', code: 'kind_mismatch' },
        { path: 'tasks.novel-forge.image.routes[0].model', code: 'kind_mismatch' },
        { path: 'tasks.memoir.insight.routes[0].model', code: 'kind_mismatch' },
      ]);
    });
  });

  describe('effort', () => {
    it('should reject a range that is not ordered min <= default <= max', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.chat']!.effort = { default: 'high', min: 'low', max: 'medium' }));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.chat.effort', code: 'effort_unordered' }]);
    });

    it('should accept a range collapsed to a single effort', () => {
      expect(issues(catalogDocument(draft => (draft.tasks['novel-forge.chat']!.effort = { default: 'medium', min: 'medium', max: 'medium' })))).toEqual([]);
    });

    it('should not check effort bounds against the efforts a model supports', () => {
      const document = catalogDocument(draft => {
        draft.models['claude-opus-5.5']!.capabilities.efforts = ['xhigh', 'high'];
        draft.models['grok-4.6']!.capabilities.efforts = ['high'];
        draft.tasks['novel-forge.chat']!.effort = { default: 'none', max: 'max' };
      });
      expect(issues(document)).toEqual([]);
    });

    it('should ignore the effort range for a model that does not reason', () => {
      expect(issues(catalogDocument(draft => (draft.tasks['memoir.insight']!.effort = { default: 'max' })))).toEqual([]);
    });
  });

  describe('data policy', () => {
    it('should reject an in_cluster_only task whose model is deployed outside the cluster', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.image']!.dataPolicy = 'in_cluster_only'));
      expect(issues(document)).toEqual([{ path: 'tasks.novel-forge.image.routes[0].model', code: 'data_policy_violation' }]);
    });

    it('should accept an in_cluster_only task served only in the cluster', () => {
      expect(issues(catalogDocument(draft => (draft.tasks['memoir.insight']!.dataPolicy = 'in_cluster_only')))).toEqual([]);
    });
  });

  describe('routes', () => {
    it('should reject a task without routes', () => {
      expect(issues(catalogDocument(draft => (draft.tasks['memoir.insight']!.routes = [])))).toEqual([{ path: 'tasks.memoir.insight.routes', code: 'no_routes' }]);
    });

    it('should reject a task with no default route or with two', () => {
      const document = catalogDocument(draft => {
        draft.tasks['novel-forge.chat']!.routes.pop();
        draft.tasks['memoir.insight']!.routes.push({ model: 'llama3.1' });
      });
      expect(issues(document)).toEqual([
        { path: 'tasks.novel-forge.chat.routes', code: 'default_route_count' },
        { path: 'tasks.memoir.insight.routes', code: 'default_route_count' },
      ]);
    });

    it('should count a route with empty selectors as the default', () => {
      expect(issues(catalogDocument(draft => (draft.tasks['memoir.insight']!.routes[0]!.when = {})))).toEqual([]);
      expect(issues(catalogDocument(draft => draft.tasks['memoir.insight']!.routes.push({ when: {}, model: 'llama3.1' })))).toEqual([
        { path: 'tasks.memoir.insight.routes', code: 'default_route_count' },
      ]);
    });
  });

  describe('budgets', () => {
    it('should reject a budget without any limit', () => {
      const document = catalogDocument(draft => (draft.budgets[0] = { app: 'novel-forge', per: 'app', window: '1d' }));
      expect(issues(document)).toEqual([{ path: 'budgets[0]', code: 'budget_without_limit' }]);
    });

    it('should reject a budget for an app that owns no task', () => {
      const document = catalogDocument(draft => (draft.budgets[0]!.app = 'novel-forg'));
      expect(issues(document)).toEqual([{ path: 'budgets[0].app', code: 'unknown_app' }]);
    });

    it('should accept a budget limiting only cost', () => {
      expect(issues(catalogDocument(draft => (draft.budgets[0] = { app: 'memoir', per: 'app', window: '30d', maxListCostUsd: 5 })))).toEqual([]);
    });
  });

  describe('against the active document', () => {
    it('should reject dropping a published task or alias', () => {
      const document = catalogDocument(draft => {
        delete draft.tasks['novel-forge.image'];
        delete draft.aliases.llama;
        draft.tasks['novel-forge.chat']!.aliases = ['opus', 'grok', 'preview'];
      });
      expect(issues(document, catalogDocument())).toEqual([
        { path: 'tasks.novel-forge.image', code: 'task_removed' },
        { path: 'aliases.llama', code: 'alias_removed' },
      ]);
    });

    it('should accept retiring an alias and adding new keys', () => {
      const document = catalogDocument(draft => {
        draft.aliases.opus!.state = 'retired';
        draft.aliases.sonnet = { label: 'Sonnet', model: 'claude-opus-5.5', state: 'active' };
        draft.tasks['memoir.digest'] = { kind: 'chat', requires: [], dataPolicy: 'any', routes: [{ model: 'llama3.1' }] };
      });
      expect(issues(document, catalogDocument())).toEqual([]);
    });

    it('should apply no history rule without an active document', () => {
      const document = catalogDocument(draft => {
        delete draft.aliases.preview;
        delete draft.tasks['novel-forge.image'];
        draft.tasks['novel-forge.chat']!.aliases = ['opus'];
      });
      expect(issues(document)).toEqual([]);
    });

    it('should reject a pinned task whose routes changed', () => {
      const active = catalogDocument(draft => (draft.models['qwen3-embedding-2'] = structuredClone(draft.models['qwen3-embedding']!)));
      const document = catalogDocument(draft => {
        draft.models['qwen3-embedding-2'] = structuredClone(draft.models['qwen3-embedding']!);
        draft.tasks['novel-forge.embedding']!.routes[0]!.model = 'qwen3-embedding-2';
      });
      expect(issues(document, active)).toEqual([{ path: 'tasks.novel-forge.embedding.routes', code: 'pinned_changed' }]);
    });

    it('should reject a pinned task gaining an alias that reaches another model', () => {
      const document = catalogDocument(draft => {
        draft.models['qwen3-embedding-2'] = structuredClone(draft.models['qwen3-embedding']!);
        draft.aliases.embedder = { label: 'Embedder', model: 'qwen3-embedding-2', state: 'hidden' };
        draft.tasks['novel-forge.embedding']!.aliases = ['embedder'];
      });
      expect(issues(document, catalogDocument())).toEqual([{ path: 'tasks.novel-forge.embedding.aliases', code: 'pinned_changed' }]);
    });

    it('should reject a pinned model whose dimensions or deployment ids changed', () => {
      const document = catalogDocument(draft => (draft.models['qwen3-embedding']!.capabilities.embedding = { dimensions: 768 }));
      expect(issues(document, catalogDocument())).toEqual([{ path: 'models.qwen3-embedding', code: 'pinned_changed' }]);
    });

    it('should accept a pinned model gaining a failover deployment of the same id', () => {
      const document = catalogDocument(draft => draft.models['qwen3-embedding']!.deployments.push({ provider: 'subscription', id: 'qwen3-embedding:0.6b' }));
      expect(issues(document, catalogDocument())).toEqual([]);
    });

    it('should refuse unpinning a published pinned task', () => {
      const document = catalogDocument(draft => (draft.tasks['novel-forge.embedding']!.pinned = false));
      expect(issues(document, catalogDocument())).toEqual([{ path: 'tasks.novel-forge.embedding.pinned', code: 'pinned_changed' }]);
    });

    it('should still guard the models of a pinned task that the draft unpins in the same change', () => {
      const document = catalogDocument(draft => {
        draft.tasks['novel-forge.embedding']!.pinned = false;
        draft.models['qwen3-embedding']!.deployments[0]!.id = 'nomic-embed-text';
      });
      expect(issues(document, catalogDocument())).toEqual([
        { path: 'tasks.novel-forge.embedding.pinned', code: 'pinned_changed' },
        { path: 'models.qwen3-embedding', code: 'pinned_changed' },
      ]);
    });

    it('should let a published task become pinned', () => {
      expect(
        issues(
          catalogDocument(draft => (draft.tasks['novel-forge.image']!.pinned = true)),
          catalogDocument(),
        ),
      ).toEqual([]);
    });

    it('should let an unpinned task change its routes', () => {
      expect(
        issues(
          catalogDocument(draft => (draft.tasks['novel-forge.chat']!.routes[0]!.model = 'claude-opus-5.5')),
          catalogDocument(),
        ),
      ).toEqual([]);
    });
  });
});

describe('checkCatalogDocument', () => {
  it('should return the parsed document when every rule passes', () => {
    expect(checkCatalogDocument(catalogDocument(), null)).toEqual({ valid: true, document: catalogDocument() });
  });

  it('should stop at structural issues before applying the semantic rules', () => {
    const document: Record<string, any> = catalogDocument(draft => (draft.tasks['memoir.insight']!.routes = []));
    document.extra = true;
    expect(checkCatalogDocument(document, null)).toEqual({ valid: false, issues: [{ path: 'extra', code: 'unknown_field', message: "Unknown field 'extra'" }] });
  });

  it('should return the semantic issues of a well-formed document', () => {
    const check = checkCatalogDocument(
      catalogDocument(draft => (draft.tasks['memoir.insight']!.routes = [])),
      null,
    );
    expect(check.valid ? [] : check.issues.map(issue => issue.code)).toEqual(['no_routes']);
  });
});

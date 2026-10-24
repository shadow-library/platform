import { describe, expect, it } from 'bun:test';

import { issueOwner, issueSentence } from '../src/features/catalog/catalog-issues';
import { catalogFixture } from './catalog-fixture';

describe('issueOwner', () => {
  const document = {
    ...catalogFixture(),
    tasks: { ...catalogFixture().tasks, 'novel-forge.chat.v2': { kind: 'chat', dataPolicy: 'any', routes: [] } },
    budgets: [...catalogFixture().budgets, { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 10 }],
  };

  it('should resolve a task key that contains dots against the document', () => {
    expect(issueOwner('tasks.novel-forge.chat.routes[1].model', document)).toEqual({ area: 'task', entityKey: 'novel-forge.chat' });
  });

  it('should prefer the longest key when one task key extends another', () => {
    expect(issueOwner('tasks.novel-forge.chat.v2.routes[0].model', document)).toEqual({ area: 'task', entityKey: 'novel-forge.chat.v2' });
    expect(issueOwner('tasks.novel-forge.chat.v2', document)).toEqual({ area: 'task', entityKey: 'novel-forge.chat.v2' });
  });

  it('should resolve model, alias and provider keys that contain dots', () => {
    expect(issueOwner('models.llama3.1.deployments[0].provider', document)).toEqual({ area: 'model', entityKey: 'llama3.1' });
    expect(issueOwner('aliases.opus.model', document)).toEqual({ area: 'alias', entityKey: 'opus' });
    expect(issueOwner('providers.openrouter.credential', document)).toEqual({ area: 'provider', entityKey: 'openrouter' });
  });

  it('should fall back to the field name for a key the document no longer has', () => {
    expect(issueOwner('tasks.novel-forge.writing', document)).toEqual({ area: 'task', entityKey: 'novel-forge.writing' });
    expect(issueOwner('tasks.novel-forge.gone.routes[0].model', document)).toEqual({ area: 'task', entityKey: 'novel-forge.gone' });
  });

  it('should key a budget the way the change list does, telling duplicates apart', () => {
    expect(issueOwner('budgets[1].maxCalls', document)).toEqual({ area: 'budget', entityKey: 'memoir/app/30d' });
    expect(issueOwner('budgets[2]', document)).toEqual({ area: 'budget', entityKey: 'novel-forge/subject/1h#2' });
    expect(issueOwner('budgets[9].app', document)).toEqual({ area: 'budget', entityKey: 'budgets[9]' });
  });

  it('should leave issues about the whole document or a whole section unowned', () => {
    for (const path of ['', 'budgets', 'providers', 'version']) expect(issueOwner(path, document)).toBeNull();
  });
});

describe('issueSentence', () => {
  it('should word a known code plainly', () => {
    expect(issueSentence({ path: 'budgets[0]', code: 'budget_without_limit', message: 'A budget needs maxCalls, maxListCostUsd or both' })).toBe(
      'The budget needs a cost limit, a call limit or both',
    );
  });

  it('should keep the server detail for codes that only say a value is wrong', () => {
    expect(issueSentence({ path: 'tasks.memoir.insight.label', code: 'invalid_value', message: 'Expected at most 60 characters' })).toBe(
      "This value isn't allowed: Expected at most 60 characters",
    );
  });

  it('should fall back to the server message for a code it does not know', () => {
    expect(issueSentence({ path: '', code: 'something_new', message: 'Something new went wrong' })).toBe('Something new went wrong');
  });
});

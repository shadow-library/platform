import { describe, expect, it } from 'bun:test';

import { HIDDEN_THREAD_PLACEHOLDER, renderEndingContract } from '@modules/ai/schemas';

const CONTRACT = {
  hookType: 'turn',
  emotionalBeat: 'unease',
  openQuestion: 'who lit the lamp?',
  handoffState: 'fog rolls in',
  mustNotResolve: ['thread:lamp_signal', 'fact:keeper_is_sister', 'fact:vault_is_empty', 'keeper_is_sister'],
};

const WRITER_NOTES = new Map<string, string | null>([
  ['keeper_is_sister', 'Whenever the keeper is asked about the smuggler, she changes the subject.'],
  ['vault_is_empty', null],
]);

describe('renderEndingContract', () => {
  it('should render mustNotResolve verbatim for the judge', () => {
    expect(renderEndingContract(CONTRACT)).toContain('Must NOT resolve: thread:lamp_signal, fact:keeper_is_sister, fact:vault_is_empty, keeper_is_sister');
  });

  it('should replace fact entries with their writer note or a generic instruction for the writer', () => {
    const rendered = renderEndingContract(CONTRACT, WRITER_NOTES);
    expect(rendered).toContain(`Must NOT resolve: thread:lamp_signal, Whenever the keeper is asked about the smuggler, she changes the subject., ${HIDDEN_THREAD_PLACEHOLDER}`);
    expect(rendered).not.toContain('keeper_is_sister');
    expect(rendered).not.toContain('vault_is_empty');
  });

  it('should hide a fact entry whose fact no longer exists behind the generic instruction', () => {
    const rendered = renderEndingContract({ ...CONTRACT, mustNotResolve: ['fact:deleted_secret'] }, new Map());
    expect(rendered).toContain(`Must NOT resolve: ${HIDDEN_THREAD_PLACEHOLDER}`);
    expect(rendered).not.toContain('deleted_secret');
  });

  it('should render nothing for a missing contract', () => {
    expect(renderEndingContract(null, WRITER_NOTES)).toBe('');
  });
});

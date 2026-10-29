import { type ListProposalsQueryParams } from './api-types.gen';

/** Canon is never edited directly: a chat turn stages a proposal, and applying it writes the change-set. */
export const refinementKeys = {
  sessions: (projectId: string) => ['projects', projectId, 'chat-sessions'] as const,
  session: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId] as const,
  messages: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'messages'] as const,
  turn: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'turn'] as const,
  proposals: (projectId: string) => ['projects', projectId, 'refinement-proposals'] as const,
  proposalList: (projectId: string, params?: ListProposalsQueryParams) => [...refinementKeys.proposals(projectId), 'list', params] as const,
  proposal: (projectId: string, proposalId: string) => [...refinementKeys.proposals(projectId), proposalId] as const,
  proposalCurrent: (projectId: string, proposalId: string) => [...refinementKeys.proposal(projectId, proposalId), 'current'] as const,
  changes: (projectId: string) => ['projects', projectId, 'changes'] as const,
};

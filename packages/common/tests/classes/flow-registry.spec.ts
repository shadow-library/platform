/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { FlowDefinition, FlowManager, FlowRegistry, InternalError } from '@shadow-library/common';

/**
 * Defining types
 */

type AuthState = 'start' | 'credentials-verified' | 'mfa-pending' | 'mfa-verified' | 'authenticated' | 'failed';
type ApprovalState = 'pending' | 'approved' | 'rejected';

interface AuthContext {
  userId: string;
  requiresMFA: boolean;
  verificationCode?: string;
  attempts?: number;
}

interface ApprovalContext {
  requestId: string;
  approver?: string;
  reason?: string;
}

/**
 * Declaring the constants
 */

const authFlowDefinition: FlowDefinition<AuthState, AuthContext> = {
  name: 'auth',
  startState: 'start',
  states: {
    start: { getNextStates: () => ['credentials-verified', 'failed'] },
    'credentials-verified': { getNextStates: state => (state.context.requiresMFA ? ['mfa-pending'] : ['authenticated']) },
    'mfa-pending': {
      getNextStates: state => {
        const attempts = state.context.attempts ?? 0;
        return attempts < 3 ? ['mfa-verified', 'mfa-pending', 'failed'] : ['failed'];
      },
    },
    'mfa-verified': { getNextStates: () => ['authenticated'] },
    authenticated: { isFinal: true },
    failed: { isFinal: true },
  },
};

const approvalFlowDefinition: FlowDefinition<ApprovalState, ApprovalContext> = {
  name: 'approval',
  startState: 'pending',
  states: {
    pending: { getNextStates: () => ['approved', 'rejected'] },
    approved: { isFinal: true },
    rejected: { isFinal: true },
  },
};

describe('FlowRegistry', () => {
  let registry: FlowRegistry;

  beforeEach(() => {
    registry = new FlowRegistry();
  });

  describe('register', () => {
    it('should register a flow definition successfully', () => {
      const result = registry.register(authFlowDefinition);

      expect(result).toBe(registry);
      expect(registry.has('auth')).toBe(true);
    });

    it('should throw error when registering duplicate flow name', () => {
      registry.register(authFlowDefinition);

      expect(() => registry.register(authFlowDefinition)).toThrow(InternalError);
      expect(() => registry.register(authFlowDefinition)).toThrow("Flow definition 'auth' is already registered");
    });

    it('should allow chaining multiple register calls', () => {
      const result = registry.register(authFlowDefinition).register(approvalFlowDefinition);

      expect(result).toBe(registry);
      expect(registry.has('auth')).toBe(true);
      expect(registry.has('approval')).toBe(true);
    });
  });

  describe('registerAll', () => {
    it('should register multiple flow definitions at once', () => {
      const result = registry.registerAll([authFlowDefinition, approvalFlowDefinition]);

      expect(result).toBe(registry);
      expect(registry.has('auth')).toBe(true);
      expect(registry.has('approval')).toBe(true);
    });

    it('should register empty array without error', () => {
      const result = registry.registerAll([]);

      expect(result).toBe(registry);
      expect(registry.getRegisteredFlows()).toHaveLength(0);
    });

    it('should throw error if any flow is duplicate', () => {
      registry.register(authFlowDefinition);

      expect(() => registry.registerAll([authFlowDefinition, approvalFlowDefinition])).toThrow(InternalError);
      expect(registry.has('approval')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing flow definition', () => {
      registry.register(authFlowDefinition);

      const result = registry.unregister('auth');

      expect(result).toBe(true);
      expect(registry.has('auth')).toBe(false);
    });

    it('should return false when unregistering non-existent flow', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should allow re-registering after unregister', () => {
      registry.register(authFlowDefinition);
      registry.unregister('auth');

      expect(() => registry.register(authFlowDefinition)).not.toThrow();
      expect(registry.has('auth')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all registered flows', () => {
      registry.registerAll([authFlowDefinition, approvalFlowDefinition]);

      registry.clear();

      expect(registry.has('auth')).toBe(false);
      expect(registry.has('approval')).toBe(false);
      expect(registry.getRegisteredFlows()).toHaveLength(0);
    });

    it('should not throw error when clearing empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true for registered flow', () => {
      registry.register(authFlowDefinition);

      expect(registry.has('auth')).toBe(true);
    });

    it('should return false for unregistered flow', () => {
      expect(registry.has('non-existent')).toBe(false);
    });

    it('should return false after unregistering', () => {
      registry.register(authFlowDefinition);
      registry.unregister('auth');

      expect(registry.has('auth')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return registered flow definition', () => {
      registry.register(authFlowDefinition);

      const definition = registry.get<AuthState, AuthContext>('auth');

      expect(definition).toBe(authFlowDefinition);
      expect(definition.name).toBe('auth');
      expect(definition.startState).toBe('start');
    });

    it('should throw error for unregistered flow', () => {
      expect(() => registry.get('non-existent')).toThrow(InternalError);
      expect(() => registry.get('non-existent')).toThrow("Flow definition 'non-existent' is not registered");
    });

    it('should return correct definition for multiple registered flows', () => {
      registry.registerAll([authFlowDefinition, approvalFlowDefinition]);

      const authDef = registry.get('auth');
      const approvalDef = registry.get('approval');

      expect(authDef.name).toBe('auth');
      expect(approvalDef.name).toBe('approval');
    });
  });

  describe('getRegisteredFlows', () => {
    it('should return empty array for new registry', () => {
      expect(registry.getRegisteredFlows()).toStrictEqual([]);
    });

    it('should return all registered flow names', () => {
      registry.registerAll([authFlowDefinition, approvalFlowDefinition]);

      const flows = registry.getRegisteredFlows();

      expect(flows).toHaveLength(2);
      expect(flows).toContain('auth');
      expect(flows).toContain('approval');
    });

    it('should update after register and unregister operations', () => {
      registry.register(authFlowDefinition);
      expect(registry.getRegisteredFlows()).toStrictEqual(['auth']);

      registry.register(approvalFlowDefinition);
      expect(registry.getRegisteredFlows()).toHaveLength(2);

      registry.unregister('auth');
      expect(registry.getRegisteredFlows()).toStrictEqual(['approval']);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      registry.register(authFlowDefinition);
    });

    it('should create a new flow instance with initial context', () => {
      const flow = registry.create<AuthState, AuthContext>('auth', { userId: 'user123', requiresMFA: true });

      expect(flow).toBeInstanceOf(FlowManager);
      expect(flow.getCurrentState()).toBe('start');
      expect(flow.getContext()).toStrictEqual({ userId: 'user123', requiresMFA: true });
    });

    it('should create flow with empty context when not provided', () => {
      const flow = registry.create<AuthState, AuthContext>('auth');

      expect(flow.getCurrentState()).toBe('start');
      expect(flow.getContext()).toStrictEqual({});
    });

    it('should throw error for unregistered flow', () => {
      expect(() => registry.create('non-existent', {})).toThrow(InternalError);
      expect(() => registry.create('non-existent', {})).toThrow("Flow definition 'non-existent' is not registered");
    });

    it('should create multiple independent flow instances', () => {
      const flow1 = registry.create<AuthState, AuthContext>('auth', { userId: 'user1', requiresMFA: true });
      const flow2 = registry.create<AuthState, AuthContext>('auth', { userId: 'user2', requiresMFA: false });

      expect(flow1.getContext().userId).toBe('user1');
      expect(flow2.getContext().userId).toBe('user2');

      flow1.transitionTo('credentials-verified');
      expect(flow1.getCurrentState()).toBe('credentials-verified');
      expect(flow2.getCurrentState()).toBe('start');
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      registry.register(authFlowDefinition);
    });

    it('should restore flow from snapshot', () => {
      const originalFlow = registry.create<AuthState, AuthContext>('auth', { userId: 'user123', requiresMFA: true });

      originalFlow.transitionTo('credentials-verified').transitionTo('mfa-pending');

      const snapshot = originalFlow.toSnapshot();
      const restoredFlow = registry.restore<AuthState, AuthContext>(snapshot);

      expect(restoredFlow.getCurrentState()).toBe('mfa-pending');
      expect(restoredFlow.getContext()).toStrictEqual({ userId: 'user123', requiresMFA: true });
      expect(restoredFlow.getHistory()).toStrictEqual(['start', 'credentials-verified']);
    });

    it('should restore flow with complete state history', () => {
      const originalFlow = registry.create<AuthState, AuthContext>('auth', { userId: 'user123', requiresMFA: true, attempts: 0 });

      originalFlow.transitionTo('credentials-verified').transitionTo('mfa-pending').updateContext({ attempts: 1 }).transitionTo('mfa-verified').transitionTo('authenticated');

      const snapshot = originalFlow.toSnapshot();
      const restoredFlow = registry.restore<AuthState, AuthContext>(snapshot);

      expect(restoredFlow.getCurrentState()).toBe('authenticated');
      expect(restoredFlow.isComplete()).toBe(true);
      expect(restoredFlow.getContext().attempts).toBe(1);
      expect(restoredFlow.getHistory()).toStrictEqual(['start', 'credentials-verified', 'mfa-pending', 'mfa-verified']);
    });

    it('should throw error for snapshot with missing flowName', () => {
      const invalidSnapshot = JSON.stringify({ state: { currentState: 'start', history: [], context: {} } });

      expect(() => registry.restore(invalidSnapshot)).toThrow(InternalError);
      expect(() => registry.restore(invalidSnapshot)).toThrow('Snapshot missing flowName field');
    });

    it('should throw error for unregistered flow in snapshot', () => {
      const snapshot = JSON.stringify({ flowName: 'unregistered-flow', state: { currentState: 'start', history: [], context: {} } });

      expect(() => registry.restore(snapshot)).toThrow(InternalError);
      expect(() => registry.restore(snapshot)).toThrow("Flow definition 'unregistered-flow' is not registered");
    });

    it('should throw error for invalid JSON snapshot', () => {
      expect(() => registry.restore('invalid json')).toThrow();
    });

    it('should restore different flow types correctly', () => {
      registry.register(approvalFlowDefinition);

      const authFlow = registry.create<AuthState, AuthContext>('auth', { userId: 'user1', requiresMFA: false });
      authFlow.transitionTo('credentials-verified');

      const approvalFlow = registry.create<ApprovalState, ApprovalContext>('approval', { requestId: 'req1' });
      approvalFlow.transitionTo('approved');

      const authSnapshot = authFlow.toSnapshot();
      const approvalSnapshot = approvalFlow.toSnapshot();

      const restoredAuth = registry.restore<AuthState, AuthContext>(authSnapshot);
      const restoredApproval = registry.restore<ApprovalState, ApprovalContext>(approvalSnapshot);

      expect(restoredAuth.getCurrentState()).toBe('credentials-verified');
      expect(restoredAuth.getDefinition().name).toBe('auth');

      expect(restoredApproval.getCurrentState()).toBe('approved');
      expect(restoredApproval.getDefinition().name).toBe('approval');
    });
  });

  describe('getFlowName', () => {
    it('should extract flow name from snapshot using regex', () => {
      const snapshot = JSON.stringify({ flowName: 'auth', state: { currentState: 'start', history: [], context: {} } });

      const flowName = registry.getFlowName(snapshot);

      expect(flowName).toBe('auth');
    });

    it('should throw error for snapshot without flowName field', () => {
      const invalidSnapshot = JSON.stringify({ state: { currentState: 'start', history: [], context: {} } });

      expect(() => registry.getFlowName(invalidSnapshot)).toThrow(InternalError);
      expect(() => registry.getFlowName(invalidSnapshot)).toThrow('Snapshot missing flowName field');
    });

    it('should handle snapshots with whitespace around flowName', () => {
      const snapshot = '{ "flowName" : "auth" , "state": {} }';

      const flowName = registry.getFlowName(snapshot);

      expect(flowName).toBe('auth');
    });

    it('should work with minified JSON', () => {
      const snapshot = '{"flowName":"auth","state":{"currentState":"start","history":[],"context":{}}}';

      const flowName = registry.getFlowName(snapshot);

      expect(flowName).toBe('auth');
    });
  });
});

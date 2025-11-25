/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { FlowDefinition, FlowManager, FlowState, InternalError } from '@shadow-library/common';

/**
 * Defining types
 */

type OrderState = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

interface OrderContext {
  orderId: string;
  items: string[];
  totalAmount: number;
  trackingNumber?: string;
}

/**
 * Declaring the constants
 */

const orderFlowDefinition: FlowDefinition<OrderState, OrderContext> = {
  name: 'OrderFlow',
  startState: 'pending',
  states: {
    pending: { getNextStates: () => ['processing', 'cancelled'] },
    processing: { getNextStates: () => ['shipped', 'cancelled'] },
    shipped: { getNextStates: () => ['delivered'] },
    delivered: { isFinal: true },
    cancelled: { isFinal: true },
  },
};

describe('FlowManager', () => {
  describe('create', () => {
    it('should create a new flow manager with initial context', () => {
      const context: OrderContext = { orderId: '123', items: ['item1'], totalAmount: 100 };
      const flow = FlowManager.create(orderFlowDefinition, context);

      expect(flow.getCurrentState()).toBe('pending');
      expect(flow.getContext()).toBe(context);
      expect(flow.getHistory()).toStrictEqual([]);
    });

    it('should create a flow manager with empty context when not provided', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(flow.getCurrentState()).toBe('pending');
      expect(flow.getContext()).toStrictEqual({});
      expect(flow.getHistory()).toStrictEqual([]);
    });
  });

  describe('from', () => {
    it('should throw error for snapshot with mismatched definition', () => {
      const context: OrderContext = { orderId: '123', items: ['item1'], totalAmount: 100 };
      const originalFlow = FlowManager.create(orderFlowDefinition, context);
      originalFlow.transitionTo('processing');

      const snapshot = originalFlow.toSnapshot();

      const wrongDefinition: FlowDefinition<OrderState, OrderContext> = {
        name: 'WrongFlow',
        startState: 'pending',
        states: {
          pending: { getNextStates: () => ['processing', 'cancelled'] },
          processing: { getNextStates: () => ['shipped', 'cancelled'] },
          shipped: { getNextStates: () => ['delivered'] },
          delivered: { isFinal: true },
          cancelled: { isFinal: true },
        },
      };

      expect(() => FlowManager.from<OrderState, OrderContext>(wrongDefinition, snapshot)).toThrow(InternalError);
    });

    it('should create flow manager from snapshot string', () => {
      const context: OrderContext = { orderId: '123', items: ['item1'], totalAmount: 100 };
      const originalFlow = FlowManager.create(orderFlowDefinition, context);
      originalFlow.transitionTo('processing');

      const snapshot = originalFlow.toSnapshot();
      const restoredFlow = FlowManager.from<OrderState, OrderContext>(orderFlowDefinition, snapshot);

      expect(restoredFlow.getCurrentState()).toBe('processing');
      expect(restoredFlow.getContext()).toStrictEqual(context);
      expect(restoredFlow.getHistory()).toStrictEqual(['pending']);
    });

    it('should create flow manager from definition and state', () => {
      const state: FlowState<OrderState, OrderContext> = {
        currentState: 'shipped',
        history: ['pending', 'processing'],
        context: { orderId: '456', items: ['item2'], totalAmount: 200, trackingNumber: 'TRACK123' },
      };

      const flow = FlowManager.from(orderFlowDefinition, state);

      expect(flow.getCurrentState()).toBe('shipped');
      expect(flow.getContext()).toStrictEqual(state.context);
      expect(flow.getHistory()).toStrictEqual(['pending', 'processing']);
    });
  });

  describe('toSnapshot', () => {
    it('should serialize flow manager to JSON string', () => {
      const context: OrderContext = { orderId: '123', items: ['item1'], totalAmount: 100 };
      const flow = FlowManager.create(orderFlowDefinition, context);
      flow.transitionTo('processing');

      const snapshot = flow.toSnapshot();
      const parsed = JSON.parse(snapshot);

      expect(parsed.flowName).toBe('OrderFlow');
      expect(parsed.state.currentState).toBe('processing');
      expect(parsed.state.context).toStrictEqual(context);
      expect(parsed.state.history).toStrictEqual(['pending']);
    });

    it('should create snapshot that can be restored', () => {
      const flow1 = FlowManager.create<OrderState, OrderContext>(orderFlowDefinition, { orderId: '123', items: [], totalAmount: 50 });
      flow1.transitionTo('processing');
      flow1.updateContext({ trackingNumber: 'XYZ789' });

      const snapshot = flow1.toSnapshot();
      const flow2 = FlowManager.from<OrderState, OrderContext>(orderFlowDefinition, snapshot);

      expect(flow2.getCurrentState()).toBe(flow1.getCurrentState());
      expect(flow2.getContext()).toStrictEqual(flow1.getContext());
      expect(flow2.getHistory()).toStrictEqual(flow1.getHistory());
    });
  });

  describe('getCurrentState', () => {
    it('should return the current state', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.getCurrentState()).toBe('pending');

      flow.transitionTo('processing');
      expect(flow.getCurrentState()).toBe('processing');
    });
  });

  describe('getDefinition', () => {
    it('should return the flow definition', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.getDefinition()).toStrictEqual(orderFlowDefinition);
    });
  });

  describe('getHistory', () => {
    it('should return the state history', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.getHistory()).toStrictEqual([]);

      flow.transitionTo('processing');
      expect(flow.getHistory()).toStrictEqual(['pending']);

      flow.transitionTo('shipped');
      expect(flow.getHistory()).toStrictEqual(['pending', 'processing']);
    });

    it('should return a copy of history array', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      const history1 = flow.getHistory();
      flow.transitionTo('processing');
      const history2 = flow.getHistory();

      expect(history1).toStrictEqual([]);
      expect(history2).toStrictEqual(['pending']);
    });
  });

  describe('isComplete', () => {
    it('should return false for non-final states', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.isComplete()).toBe(false);

      flow.transitionTo('processing');
      expect(flow.isComplete()).toBe(false);

      flow.transitionTo('shipped');
      expect(flow.isComplete()).toBe(false);
    });

    it('should return true for final states', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      flow.transitionTo('processing');
      flow.transitionTo('shipped');
      flow.transitionTo('delivered');
      expect(flow.isComplete()).toBe(true);
    });

    it('should return true for cancelled state', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      flow.transitionTo('cancelled');
      expect(flow.isComplete()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return complete flow status', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      flow.transitionTo('processing');

      const status = flow.getStatus();

      expect(status.name).toBe('OrderFlow');
      expect(status.currentState).toBe('processing');
      expect(status.availableTransitions).toStrictEqual(['shipped', 'cancelled']);
      expect(status.isComplete).toBe(false);
      expect(status.history).toStrictEqual(['pending']);
    });

    it('should show completion status for final states', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      flow.transitionTo('processing');
      flow.transitionTo('shipped');
      flow.transitionTo('delivered');

      const status = flow.getStatus();

      expect(status.isComplete).toBe(true);
      expect(status.availableTransitions).toStrictEqual([]);
    });
  });

  describe('getContext', () => {
    it('should return the current context', () => {
      const context: OrderContext = { orderId: '123', items: ['item1', 'item2'], totalAmount: 150 };
      const flow = FlowManager.create(orderFlowDefinition, context);

      expect(flow.getContext()).toStrictEqual(context);
    });

    it('should return updated context', () => {
      const flow = FlowManager.create<OrderState, OrderContext>(orderFlowDefinition, { orderId: '123', items: [], totalAmount: 0 });
      flow.updateContext({ trackingNumber: 'TRACK456' });

      const context = flow.getContext();
      expect(context).toStrictEqual({ orderId: '123', items: [], totalAmount: 0, trackingNumber: 'TRACK456' });
    });
  });

  describe('updateContext', () => {
    it('should update context with partial updates', () => {
      const flow = FlowManager.create<OrderState, OrderContext>(orderFlowDefinition, { orderId: '123', items: ['item1'], totalAmount: 100 });

      flow.updateContext({ trackingNumber: 'TRACK789' });

      const context = flow.getContext();
      expect(context).toStrictEqual({ orderId: '123', items: ['item1'], totalAmount: 100, trackingNumber: 'TRACK789' });
    });

    it('should overwrite existing context properties', () => {
      const flow = FlowManager.create(orderFlowDefinition, { orderId: '123', items: ['item1'], totalAmount: 100 });

      flow.updateContext({ totalAmount: 200 });

      expect(flow.getContext().totalAmount).toBe(200);
    });

    it('should update context using a function', () => {
      const flow = FlowManager.create(orderFlowDefinition, { orderId: '123', items: [], totalAmount: 100 });
      flow.updateContext(ctx => ({ totalAmount: ctx.totalAmount + 50 }));
      expect(flow.getContext().totalAmount).toBe(150);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return available transitions for current state', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(flow.getAvailableTransitions()).toStrictEqual(['processing', 'cancelled']);

      flow.transitionTo('processing');
      expect(flow.getAvailableTransitions()).toStrictEqual(['shipped', 'cancelled']);

      flow.transitionTo('shipped');
      expect(flow.getAvailableTransitions()).toStrictEqual(['delivered']);
    });

    it('should return empty array for final states', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      flow.transitionTo('cancelled');

      expect(flow.getAvailableTransitions()).toStrictEqual([]);
    });

    it('should handle dynamic transitions based on state', () => {
      type ApprovalState = 'draft' | 'review' | 'approved' | 'rejected';
      interface ApprovalContext {
        approverCount: number;
      }

      const approvalFlow: FlowDefinition<ApprovalState, ApprovalContext> = {
        name: 'ApprovalFlow',
        startState: 'draft',
        states: {
          draft: { getNextStates: () => ['review'] },
          review: { getNextStates: state => (state.context.approverCount >= 2 ? ['approved'] : ['approved', 'rejected']) },
          approved: { isFinal: true },
          rejected: { isFinal: true },
        },
      };

      const flow1 = FlowManager.create(approvalFlow, { approverCount: 1 });
      flow1.transitionTo('review');
      expect(flow1.getAvailableTransitions()).toStrictEqual(['approved', 'rejected']);

      const flow2 = FlowManager.create(approvalFlow, { approverCount: 3 });
      flow2.transitionTo('review');
      expect(flow2.getAvailableTransitions()).toStrictEqual(['approved']);
    });
  });

  describe('peekTransitions', () => {
    it('should return potential next states from a target state', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.peekTransitions('processing')).toStrictEqual(['shipped', 'cancelled']);
    });

    it('should return empty array if target state has no transitions', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(flow.peekTransitions('delivered')).toStrictEqual([]);
    });

    it('should throw error if target state is unknown', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      expect(() => flow.peekTransitions('unknown' as any)).toThrow(InternalError);
    });
  });

  describe('canTransitionTo', () => {
    it('should return true for valid transitions', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(flow.canTransitionTo('processing')).toBe(true);
      expect(flow.canTransitionTo('cancelled')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(flow.canTransitionTo('shipped')).toBe(false);
      expect(flow.canTransitionTo('delivered')).toBe(false);
    });

    it('should update as state changes', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(flow.canTransitionTo('shipped')).toBe(false);

      flow.transitionTo('processing');
      expect(flow.canTransitionTo('shipped')).toBe(true);
    });
  });

  describe('transitionTo', () => {
    it('should transition to valid next state', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      flow.transitionTo('processing');

      expect(flow.getCurrentState()).toBe('processing');
    });

    it('should update history on transition', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      flow.transitionTo('processing');
      flow.transitionTo('shipped');

      expect(flow.getHistory()).toStrictEqual(['pending', 'processing']);
    });

    it('should throw error for invalid transitions', () => {
      const flow = FlowManager.create(orderFlowDefinition);

      expect(() => flow.transitionTo('shipped')).toThrow(InternalError);
      expect(() => flow.transitionTo('delivered')).toThrow(InternalError);
    });

    it('should apply context updates during transition', () => {
      const flow = FlowManager.create<OrderState, OrderContext>(orderFlowDefinition, { orderId: '123', items: [], totalAmount: 100 });

      flow.transitionTo('processing', { trackingNumber: 'TRACK999' });

      expect(flow.getCurrentState()).toBe('processing');
      expect(flow.getContext().trackingNumber).toBe('TRACK999');
      expect(flow.getContext().orderId).toBe('123');
    });

    it('should not allow transitions from final states', () => {
      const flow = FlowManager.create(orderFlowDefinition);
      flow.transitionTo('cancelled');

      expect(() => flow.transitionTo('processing')).toThrow(InternalError);
    });
  });

  describe('Hooks', () => {
    type HookState = 'start' | 'middle' | 'end';
    interface HookContext {
      enteredMiddle?: boolean;
      leftStart?: boolean;
      value: number;
    }

    const hookFlow: FlowDefinition<HookState, HookContext> = {
      name: 'HookFlow',
      startState: 'start',
      states: {
        start: {
          getNextStates: () => ['middle'],
          onLeave: (context, nextState) => {
            if (nextState === 'middle') {
              return { leftStart: true, value: context.value + 1 };
            }
            return true;
          },
        },
        middle: {
          getNextStates: () => ['end'],
          onEnter: context => {
            return { enteredMiddle: true, value: context.value * 2 };
          },
        },
        end: { isFinal: true },
      },
    };

    it('should execute onLeave and onEnter hooks during transition', () => {
      const flow = FlowManager.create(hookFlow, { value: 10 });
      flow.transitionTo('middle');

      expect(flow.getContext()).toMatchObject({
        leftStart: true,
        enteredMiddle: true,
        value: 22, // (10 + 1) * 2
      });
    });

    it('should prevent transition if onLeave returns false', () => {
      const guardFlow: FlowDefinition<HookState, HookContext> = {
        ...hookFlow,
        states: {
          ...hookFlow.states,
          start: {
            getNextStates: () => ['middle'],
            onLeave: () => false,
          },
        },
      };

      const flow = FlowManager.create(guardFlow, { value: 10 });
      expect(() => flow.transitionTo('middle')).toThrow(InternalError);
      expect(flow.getCurrentState()).toBe('start');
    });
  });

  describe('Actions and Auto-transition', () => {
    type ActionState = 'start' | 'step1' | 'step2' | 'end';
    interface ActionContext {
      count: number;
    }

    it('should execute actions recursively until settled', () => {
      const autoFlow: FlowDefinition<ActionState, ActionContext> = {
        name: 'AutoFlow',
        startState: 'start',
        states: {
          start: { getNextStates: () => ['step1'] },
          step1: {
            getNextStates: () => ['step2'],
            action: ctx => ({ nextState: 'step2', contextUpdates: { count: ctx.count + 1 } }),
          },
          step2: {
            getNextStates: () => ['end'],
            action: ctx => ({ nextState: 'end', contextUpdates: { count: ctx.count + 1 } }),
          },
          end: { isFinal: true },
        },
      };

      const flow = FlowManager.create(autoFlow, { count: 0 });
      flow.transitionTo('step1');

      // step1 -> action -> step2 -> action -> end
      expect(flow.getCurrentState()).toBe('end');
      expect(flow.getContext().count).toBe(2);
      expect(flow.getHistory()).toStrictEqual(['start', 'step1', 'step2']);
    });

    it('should detect infinite loops or max depth exceeded', () => {
      const loopFlow: FlowDefinition<ActionState, ActionContext> = {
        name: 'LoopFlow',
        startState: 'start',
        states: {
          start: { getNextStates: () => ['step1'] },
          step1: {
            getNextStates: () => ['step2'],
            action: () => ({ nextState: 'step2' }),
          },
          step2: {
            getNextStates: () => ['step1'],
            action: () => ({ nextState: 'step1' }),
          },
          end: { isFinal: true },
        },
      };

      const flow = FlowManager.create(loopFlow, { count: 0 });
      expect(() => flow.transitionTo('step1')).toThrow(InternalError);
    });
  });
});

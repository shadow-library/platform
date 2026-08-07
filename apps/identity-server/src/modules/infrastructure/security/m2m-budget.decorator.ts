import { Handler } from '@shadow-library/app';

type M2MBudgetDecorator = ClassDecorator & MethodDecorator;

export const M2M_BUDGET_METADATA = 'm2mBudget';

export const M2MBudget = (): M2MBudgetDecorator => Handler({ [M2M_BUDGET_METADATA]: true });

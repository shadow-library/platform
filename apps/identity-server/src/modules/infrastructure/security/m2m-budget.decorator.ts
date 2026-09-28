import { Handler } from '@shadow-library/app';

import { type M2MBudgetClass } from './security.constants';

type M2MBudgetDecorator = ClassDecorator & MethodDecorator;

export const M2M_BUDGET_METADATA = 'm2mBudget';

export const M2MBudget = (budget: M2MBudgetClass): M2MBudgetDecorator => Handler({ [M2M_BUDGET_METADATA]: budget });

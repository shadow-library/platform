/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

type M2MBudgetDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 */

/** Route metadata key the decorator writes and both rate-limit middlewares read */
export const M2M_BUDGET_METADATA = 'm2mBudget';

/**
 * Marks a route whose authenticated callers are budgeted per client rather than per source IP
 * (T-804, architecture §13.2). A fleet of pods shares one egress IP but is many callers, so
 * charging them one IP budget throttles a healthy deployment while telling an operator nothing
 * about which application misbehaved.
 *
 * On such a route the IP counter is only *read* before the handler and is counted up afterwards
 * only when the response shows the caller never authenticated — so a credential-less or forged
 * flood still exhausts the IP tier, while a caller that proves its identity is charged to its own
 * client budget instead.
 */
export const M2MBudget = (): M2MBudgetDecorator => Handler({ [M2M_BUDGET_METADATA]: true });

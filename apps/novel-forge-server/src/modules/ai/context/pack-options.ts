import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';

export interface PackPolicyOptions {
  /** The policy of the roles that will read this pack, resolved ahead of assembly so the writer class is already fixed when sections are chosen. */
  policy?: ForgeCallPolicy;
}

export interface PackOptions extends PackPolicyOptions {
  budgetTokens?: number;
}

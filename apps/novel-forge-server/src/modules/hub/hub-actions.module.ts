/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { BibleModule } from '../bible/bible.module';
import { GenerationModule } from '../generation/generation.module';
import { RefinementModule } from '../refinement/refinement.module';
import { HubActionRegistrar } from './hub-action.registrar';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [RefinementModule, GenerationModule, BibleModule],
  providers: [HubActionRegistrar],
})
export class HubActionsModule {}

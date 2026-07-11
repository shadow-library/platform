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
import { HubActionRegistrar } from './hub-action.registrar';
import { BibleModule } from '../bible/bible.module';
import { GenerationModule } from '../generation/generation.module';
import { RefinementModule } from '../refinement/refinement.module';

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
